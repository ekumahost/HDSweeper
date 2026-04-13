import SweepJob from '../models/SweepJob';
import RpcEndpoint from '../models/RpcEndpoint';
import TokenContract from '../models/TokenContract';
import { getActiveJobId, runSweepJob } from './sweeper';
import { getConfig } from '../models/AppConfig';
import { getProvider } from './blockchain';

const CRON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cronTimer: ReturnType<typeof setInterval> | null = null;

async function createAndRunSweepJob(): Promise<void> {
	// Skip if a sweep is already running
	if (getActiveJobId()) {
		console.log('[Cron] Sweep job already running, skipping.');
		return;
	}

	// Check prerequisites
	const mnemonic = await getConfig('mnemonic');
	const custodial = await getConfig('custodialWallet');
	if (!mnemonic || !custodial) {
		console.log('[Cron] Mnemonic or custodial wallet not configured, skipping.');
		return;
	}

	// Check if there's already a pending/running job
	const existing = await SweepJob.findOne({ status: { $in: ['pending', 'running'] } });
	if (existing) {
		console.log('[Cron] Pending/running job exists, skipping creation.');
		return;
	}

	// Build job — test each RPC, skip dead ones
	const activeRpcs = await RpcEndpoint.find({ isActive: true }).lean();
	const liveChainIds: number[] = [];
	const deadChains: string[] = [];

	for (const rpc of activeRpcs) {
		try {
			const provider = await getProvider((rpc as any).chainId);
			if (provider) {
				liveChainIds.push((rpc as any).chainId);
			} else {
				deadChains.push(`${(rpc as any).chainName} (${(rpc as any).chainId})`);
			}
		} catch {
			deadChains.push(`${(rpc as any).chainName} (${(rpc as any).chainId})`);
		}
	}

	if (deadChains.length > 0) {
		console.warn(`[Cron] Dead RPCs skipped: ${deadChains.join(', ')}`);
	}

	if (liveChainIds.length === 0) {
		console.log('[Cron] All RPCs unreachable, skipping.');
		return;
	}

	const tokens = await TokenContract.find({ isActive: true, chainId: { $in: liveChainIds } }).lean();

	const job = await SweepJob.create({
		mode: 'range',
		fromIndex: 0,
		toIndex: 50_000,
		status: 'pending',
		targetChainIds: liveChainIds,
		tokenAddresses: tokens.map((t: any) => t.contractAddress),
		gasLimitPerTx: 65000,
		maxGasPrice: '50',
		batchSize: 20,
		totalWallets: 200_001,
		processedWallets: 0,
		totalTxSent: 0,
		totalTxFailed: 0,
		sweptKeys: [],
		completedTxKeys: [],
		gasFundedKeys: [],
	});

	console.log(`[Cron] Sweep job created: ${job._id} (index 0–200,000)`);

	// Start it
	try {
		await runSweepJob(job._id.toString());
		console.log(`[Cron] Sweep job ${job._id} finished.`);
	} catch (err: any) {
		console.error(`[Cron] Sweep job ${job._id} error:`, err.message);
	}
}

export function startCron(): void {
	const enableCron = process.env.ENABLE_CRON?.toLowerCase() !== 'false';
	const startOnRun = process.env.START_SWEEP_ON_RUN?.toLowerCase() === 'true';

	if (!enableCron) {
		console.log('[Cron] Disabled via ENABLE_CRON=false. Sweep jobs must be started manually from the UI.');
		return;
	}

	if (cronTimer) return;
	console.log('[Cron] Scheduled sweep every 6 hours.');

	// Run first check after 30 seconds only if START_SWEEP_ON_RUN is true
	if (startOnRun) {
		console.log('[Cron] START_SWEEP_ON_RUN=true — will auto-sweep 30s after boot.');
		setTimeout(() => {
			createAndRunSweepJob().catch(err => console.error('[Cron] Error:', err.message));
		}, 30_000);
	} else {
		console.log('[Cron] START_SWEEP_ON_RUN=false — first sweep will run in 6 hours (or start manually).');
	}

	cronTimer = setInterval(() => {
		createAndRunSweepJob().catch(err => console.error('[Cron] Error:', err.message));
	}, CRON_INTERVAL_MS);
}

export function stopCron(): void {
	if (cronTimer) {
		clearInterval(cronTimer);
		cronTimer = null;
	}
}
