import { Server } from '@hapi/hapi';
import SweepJob from '../models/SweepJob';
import SweepLog from '../models/SweepLog';
import WalletList from '../models/WalletList';
import WalletAddress from '../models/WalletAddress';
import RpcEndpoint from '../models/RpcEndpoint';
import TokenContract from '../models/TokenContract';
import { getConfig } from '../models/AppConfig';
import GasWallet from '../models/GasWallet';
import { runSweepJob, requestPause, getActiveJobId } from '../services/sweeper';
import { getProvider } from '../services/blockchain';

export function registerSweepRoutes(server: Server): void {
	// List all sweep jobs
	server.route({
		method: 'GET',
		path: '/api/sweep/jobs',
		handler: async () => {
			const jobs = await SweepJob.find().sort({ createdAt: -1 }).populate('listId', 'name');
			return { jobs };
		},
	});

	// Get single job details
	server.route({
		method: 'GET',
		path: '/api/sweep/jobs/{id}',
		handler: async (request, h) => {
			const job = await SweepJob.findById(request.params.id).populate('listId', 'name');
			if (!job) return h.response({ error: 'Job not found' }).code(404);
			return { job };
		},
	});

	// Create a new sweep job
	server.route({
		method: 'POST',
		path: '/api/sweep/jobs',
		handler: async (request, h) => {
			const { listId, chainIds, tokenAddresses, gasLimitPerTx, maxGasPrice, batchSize, fromIndex, toIndex, singleAddress } = request.payload as any;

			let resolvedFromIndex = fromIndex;
			let resolvedToIndex = toIndex;

			// Resolve single address to its derivation index
			if (singleAddress) {
				const wallet = await WalletAddress.findOne({ address: { $regex: new RegExp(`^${singleAddress}$`, 'i') } });
				if (!wallet) return h.response({ error: 'Address not found in any wallet list. Use an index instead.' }).code(404);
				if (wallet.derivationIndex == null) return h.response({ error: 'Address has no derivation index' }).code(400);
				resolvedFromIndex = wallet.derivationIndex;
				resolvedToIndex = wallet.derivationIndex;
			}

			const isRangeMode = resolvedFromIndex != null && resolvedToIndex != null;

			if (!isRangeMode && !listId) return h.response({ error: 'listId, index range, or address required' }).code(400);

			let totalWallets = 0;

			if (isRangeMode) {
				const from = parseInt(resolvedFromIndex, 10);
				const to = parseInt(resolvedToIndex, 10);
				if (isNaN(from) || isNaN(to) || from < 0 || to < from) {
					return h.response({ error: 'Invalid index range. toIndex must be >= fromIndex and both >= 0' }).code(400);
				}
				totalWallets = to - from + 1;
			} else {
				// Validate list exists and has matched addresses
				const list = await WalletList.findById(listId);
				if (!list) return h.response({ error: 'Wallet list not found' }).code(404);
				if (list.matchedAddresses === 0) {
					return h.response({ error: 'No matched addresses in this list. Run key derivation first.' }).code(400);
				}
				totalWallets = list.matchedAddresses;
			}

			// Validate prerequisites
			const [mnemonic, custodialWallet, gasWallet] = await Promise.all([
				getConfig('mnemonic'),
				getConfig('custodialWallet'),
				GasWallet.findOne(),
			]);

			if (!mnemonic) return h.response({ error: 'Mnemonic not configured' }).code(400);
			if (!custodialWallet) return h.response({ error: 'Custodial wallet not configured' }).code(400);
			if (!gasWallet) return h.response({ error: 'Gas wallet not configured' }).code(400);

			// Validate chains have RPCs — test each connection, skip dead ones
			const activeRpcs = await RpcEndpoint.find({ isActive: true });
			const liveChains: number[] = [];
			const deadChains: string[] = [];

			for (const rpc of activeRpcs) {
				try {
					const provider = await getProvider(rpc.chainId);
					if (provider) {
						liveChains.push(rpc.chainId);
					} else {
						deadChains.push(`${rpc.chainName} (${rpc.chainId})`);
					}
				} catch {
					deadChains.push(`${rpc.chainName} (${rpc.chainId})`);
				}
			}

			if (deadChains.length > 0) {
				console.warn(`[SweepJob] Dead RPCs skipped: ${deadChains.join(', ')}`);
			}

			const targetChains = chainIds?.length
				? chainIds.filter((c: number) => liveChains.includes(c))
				: liveChains;

			if (targetChains.length === 0) {
				return h.response({ error: 'No reachable RPCs. Dead: ' + deadChains.join(', ') }).code(400);
			}

			// Get active tokens for target chains
			const tokenFilter: any = { isActive: true, chainId: { $in: targetChains } };
			if (tokenAddresses?.length) {
				tokenFilter.contractAddress = { $in: tokenAddresses.map((a: string) => a.toLowerCase()) };
			}
			const tokens = await TokenContract.find(tokenFilter);

			const jobData: any = {
				mode: isRangeMode ? 'range' : 'list',
				status: 'pending',
				targetChainIds: targetChains,
				tokenAddresses: tokens.map(t => t.contractAddress),
				gasLimitPerTx: gasLimitPerTx || 65000,
				maxGasPrice: maxGasPrice || '50',
				batchSize: batchSize || 20,
				totalWallets,
				processedWallets: 0,
				successCount: 0,
				failCount: 0,
				totalValue: '0',
				sweptKeys: [],
				completedTxKeys: [],
				gasFundedKeys: [],
			};

			if (isRangeMode) {
				jobData.fromIndex = parseInt(resolvedFromIndex, 10);
				jobData.toIndex = parseInt(resolvedToIndex, 10);
			} else {
				jobData.listId = listId;
			}

			const job = await SweepJob.create(jobData);

			return h.response({ job }).code(201);
		},
	});

	// Start / Resume a sweep job
	server.route({
		method: 'POST',
		path: '/api/sweep/jobs/{id}/start',
		handler: async (request, h) => {
			const job = await SweepJob.findById(request.params.id);
			if (!job) return h.response({ error: 'Job not found' }).code(404);
			if (job.status === 'running') return h.response({ error: 'Job already running' }).code(400);
			if (job.status === 'completed') return h.response({ error: 'Job already completed' }).code(400);

			// Prevent starting if another job is actively running in memory
			const currentActive = getActiveJobId();
			if (currentActive && currentActive !== request.params.id) {
				return h.response({ error: `Another job is already running (${currentActive})` }).code(409);
			}

			const wasResuming = job.status === 'paused' || job.status === 'gas_depleted' || job.status === 'failed';

			// Clear pause state for resume
			job.status = 'pending';
			job.pauseReason = undefined as any;
			job.pausedAt = undefined as any;
			await job.save();

			// Launch sweep in background (non-blocking)
			runSweepJob(job._id.toString()).catch((err: any) => {
				console.error(`Sweep job ${job._id} failed:`, err);
				// Reset job status so it doesn't stay as 'pending' forever
				SweepJob.findByIdAndUpdate(job._id, { status: 'failed', pauseReason: err.message }).catch(() => {});
			});

			return { message: wasResuming ? 'Sweep resumed' : 'Sweep started', jobId: job._id };
		},
	});

	// Pause a sweep job
	server.route({
		method: 'POST',
		path: '/api/sweep/jobs/{id}/pause',
		handler: async (request, h) => {
			const job = await SweepJob.findById(request.params.id);
			if (!job) return h.response({ error: 'Job not found' }).code(404);
			if (job.status !== 'running') return h.response({ error: 'Job is not running' }).code(400);

			// If this job isn't the one actually running in memory, it's stale
			if (getActiveJobId() !== request.params.id) {
				job.status = 'paused';
				job.pauseReason = 'Job was not actively running (stale status after restart)';
				job.pausedAt = new Date();
				await job.save();
				return { message: 'Stale job reset to paused', jobId: job._id };
			}

			requestPause();

			return { message: 'Pause requested', jobId: job._id };
		},
	});

	// Get job logs
	server.route({
		method: 'GET',
		path: '/api/sweep/jobs/{id}/logs',
		handler: async (request) => {
			const page = Number(request.query.page) || 1;
			const limit = Math.min(Number(request.query.limit) || 100, 500);
			const skip = (page - 1) * limit;
			const status = request.query.status as string;
			const chainId = request.query.chainId ? Number(request.query.chainId) : undefined;

			const filter: any = { jobId: request.params.id };
			if (status) filter.status = status;
			if (chainId) filter.chainId = chainId;

			const [logs, total] = await Promise.all([
				SweepLog.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
				SweepLog.countDocuments(filter),
			]);

			return { logs, total, page, limit, pages: Math.ceil(total / limit) };
		},
	});

	// Delete a job (only pending or completed/failed)
	server.route({
		method: 'DELETE',
		path: '/api/sweep/jobs/{id}',
		handler: async (request, h) => {
			const job = await SweepJob.findById(request.params.id);
			if (!job) return h.response({ error: 'Job not found' }).code(404);
			if (job.status === 'running') return h.response({ error: 'Cannot delete running job' }).code(400);

			await SweepLog.deleteMany({ jobId: job._id });
			await SweepJob.findByIdAndDelete(job._id);

			return { deleted: true };
		},
	});

	// Active sweeps status
	server.route({
		method: 'GET',
		path: '/api/sweep/active',
		handler: async () => {
			const id = getActiveJobId();
			return { active: id ? [id] : [] };
		},
	});
}
