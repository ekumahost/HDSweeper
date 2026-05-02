import https from 'https';
import { URL } from 'url';
import { ethers } from 'ethers';
import DerivedKey from '../models/DerivedKey';
import DirectSweepWallet from '../models/DirectSweepWallet';
import RpcEndpoint from '../models/RpcEndpoint';
import SweepJob from '../models/SweepJob';
import SweepLog from '../models/SweepLog';
import TokenContract from '../models/TokenContract';
import { getConfig } from '../models/AppConfig';
import {
	DEFAULT_DIRECT_SWEEPER_BASE_URL,
	DEFAULT_DIRECT_SWEEP_DERIVATION_MAX_INDEX,
	DEFAULT_DIRECT_SWEEP_DERIVATION_SEARCH_WINDOW,
} from '../config/directSweeperDefaults';
import { getMnemonic } from './keyDerivation';
import { getActiveJobId, runSweepJob } from './sweeper';

const VIEW_PATH = '/hooks/unremitted-balances/view';
const UPDATE_PATH = '/hooks/unremitted-balances/update';
const MAX_PER_PAGE = 100;
const DERIVE_BATCH_SIZE = 1000;

let isDirectSweepRunning = false;

interface ViewItem {
	_id?: string;
	walletAddress?: string;
	chainId?: number;
	chainName?: string;
	currencySymbol?: string;
	currencyName?: string;
	contractAddress?: string;
	isNativeToken?: boolean;
	integrationUpdateStatus?: string | null;
	integrationUpdateMessage?: string | null;
	integrationFailureReason?: string | null;
	integrationUpdatedAt?: string | null;
	chainDetail?: {
		chainId?: number;
		chainName?: string;
		blockchainNetwork?: {
			id?: string;
			name?: string;
			abbreviation?: string;
			networkId?: number;
			iconUrl?: string;
		};
	};
	currencyDetail?: {
		symbol?: string;
		name?: string;
		isNativeToken?: boolean;
		contractAddress?: string;
		currency?: {
			id?: string;
			symbol?: string;
			name?: string;
			iconUrl?: string;
			usdValue?: number;
		};
	};
	blockchainNetworkId?: {
		networkId?: number;
	};
}

interface ViewResponse {
	data?: {
		itemsList?: ViewItem[];
		paginator?: {
			itemCount?: number;
			perPage?: number;
			pageCount?: number;
			currentPage?: number;
			hasNextPage?: boolean;
			next?: number | null;
		};
	};
}

function getBaseUrl(): string {
	return process.env.UNREMITTED_BALANCES_BASE_URL?.trim() || DEFAULT_DIRECT_SWEEPER_BASE_URL;
}

function requestJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
	const url = new URL(path, getBaseUrl());
	const payload = body ? JSON.stringify(body) : undefined;

	return new Promise((resolve, reject) => {
		const req = https.request(
			url,
			{
				method,
				headers: {
					'Content-Type': 'application/json',
					...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
				},
			},
			(res) => {
				let raw = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					raw += chunk;
				});
				res.on('end', () => {
					const code = res.statusCode || 0;
					if (code < 200 || code >= 300) {
						reject(new Error(`HTTP ${code}: ${raw.slice(0, 500)}`));
						return;
					}
					try {
						resolve((raw ? JSON.parse(raw) : {}) as T);
					} catch {
						reject(new Error('Failed to parse API JSON response'));
					}
				});
			}
		);

		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function hasNextPage(resp: ViewResponse): boolean {
	const paginator = resp.data?.paginator;
	if (!paginator) return false;
	if (typeof paginator.hasNextPage === 'boolean') return paginator.hasNextPage;
	if (paginator.next != null) return true;
	if (typeof paginator.currentPage === 'number' && typeof paginator.pageCount === 'number') {
		return paginator.currentPage < paginator.pageCount;
	}
	return false;
}

function normalizeViewItem(item: ViewItem): {
	externalId: string;
	walletAddress: string;
	chainId: number;
	chainName: string;
	currencySymbol: string;
	isNativeToken: boolean;
	integrationUpdateStatus: string;
	integrationUpdateMessage: string | null;
	integrationFailureReason: string | null;
	integrationUpdatedAt: Date | null;
	apiPayload: Record<string, unknown>;
} | null {
	const walletAddress = item.walletAddress?.trim().toLowerCase();
	const chainId = Number(
		item.chainId
			?? item.chainDetail?.chainId
			?? item.chainDetail?.blockchainNetwork?.networkId
			?? item.blockchainNetworkId?.networkId
	);
	if (!walletAddress || !Number.isFinite(chainId) || chainId <= 0) {
		return null;
	}

	const chainName = item.chainName
		|| item.chainDetail?.chainName
		|| item.chainDetail?.blockchainNetwork?.name
		|| `Chain ${chainId}`;
	const currencySymbol = item.currencySymbol
		|| item.currencyDetail?.symbol
		|| item.currencyDetail?.currency?.symbol
		|| '';
	const currencyName = item.currencyName
		|| item.currencyDetail?.name
		|| item.currencyDetail?.currency?.name
		|| '';
	const contractAddress = item.contractAddress
		|| item.currencyDetail?.contractAddress
		|| null;
	const currencyId = item.currencyDetail?.currency?.id || null;
	const isNativeToken = Boolean(item.isNativeToken ?? item.currencyDetail?.isNativeToken);
	const integrationUpdateStatus = String(item.integrationUpdateStatus || 'pending').toLowerCase();
	const externalId = item._id?.trim()
		|| [String(chainId), walletAddress, contractAddress || currencyId || currencySymbol || 'native', isNativeToken ? 'native' : 'token'].join(':');

	return {
		externalId,
		walletAddress,
		chainId,
		chainName,
		currencySymbol,
		isNativeToken,
		integrationUpdateStatus,
		integrationUpdateMessage: item.integrationUpdateMessage || null,
		integrationFailureReason: item.integrationFailureReason || null,
		integrationUpdatedAt: item.integrationUpdatedAt ? new Date(item.integrationUpdatedAt) : null,
		apiPayload: {
			externalId,
			walletAddress,
			chainDetail: {
				chainId,
				chainName,
				blockchainNetwork: {
					id: item.chainDetail?.blockchainNetwork?.id || null,
					name: item.chainDetail?.blockchainNetwork?.name || chainName,
					abbreviation: item.chainDetail?.blockchainNetwork?.abbreviation || null,
					networkId: item.chainDetail?.blockchainNetwork?.networkId || chainId,
					iconUrl: item.chainDetail?.blockchainNetwork?.iconUrl || null,
				},
			},
			currencyDetail: {
				symbol: currencySymbol,
				name: currencyName,
				isNativeToken,
				contractAddress,
				currency: {
					id: currencyId,
					symbol: item.currencyDetail?.currency?.symbol || currencySymbol,
					name: item.currencyDetail?.currency?.name || currencyName,
					iconUrl: item.currencyDetail?.currency?.iconUrl || null,
					usdValue: item.currencyDetail?.currency?.usdValue ?? null,
				},
			},
			integrationUpdateStatus,
			integrationUpdateMessage: item.integrationUpdateMessage || null,
			integrationFailureReason: item.integrationFailureReason || null,
			integrationUpdatedAt: item.integrationUpdatedAt || null,
		},
	};
}

export async function syncDirectWalletQueueFromApi(): Promise<{ pages: number; recordsUpserted: number }> {
	let page = 1;
	let pages = 0;
	let recordsUpserted = 0;

	while (true) {
		const params = new URLSearchParams({ page: String(page), per_page: String(MAX_PER_PAGE) });
		const resp = await requestJson<ViewResponse>('GET', `${VIEW_PATH}?${params.toString()}`);
		const items = resp.data?.itemsList || [];

		if (items.length > 0) {
			const ops = items
				.map((item) => {
					const normalized = normalizeViewItem(item);
					if (!normalized) {
						return null;
					}

					const localStatus: 'pending' | 'completed' = normalized.integrationUpdateStatus === 'success' ? 'completed' : 'pending';

					return {
						updateOne: {
							filter: { externalId: normalized.externalId, chainId: normalized.chainId },
							update: {
								$set: {
									walletAddress: normalized.walletAddress,
									chainId: normalized.chainId,
									chainName: normalized.chainName,
									currencySymbol: normalized.currencySymbol,
									isNativeToken: normalized.isNativeToken,
									integrationUpdateStatus: normalized.integrationUpdateStatus,
									integrationUpdateMessage: normalized.integrationUpdateMessage,
									integrationFailureReason: normalized.integrationFailureReason,
									integrationUpdatedAt: normalized.integrationUpdatedAt,
									status: localStatus,
									lastSyncedAt: new Date(),
									apiPayload: normalized.apiPayload,
								},
								$setOnInsert: {
									externalId: normalized.externalId,
									lastProcessedAt: null,
									lastError: null,
								},
							},
							upsert: true,
						},
					};
				})
				.filter((op): op is NonNullable<typeof op> => Boolean(op));

			if (ops.length > 0) {
				await DirectSweepWallet.bulkWrite(ops as any[], { ordered: false });
				recordsUpserted += ops.length;
			}
		}

		pages += 1;
		if (!hasNextPage(resp) || page > 10_000) break;
		page += 1;
	}

	return { pages, recordsUpserted };
}

async function notifyIntegrationUpdate(params: {
	externalId?: string;
	walletAddress: string;
	chainId: number;
	status: 'success' | 'failed';
	message: string;
}): Promise<void> {
	const payload: {
		id?: string;
		walletAddress: string;
		chainId: number;
		status: 'success' | 'failed';
		message: string;
	} = {
		walletAddress: params.walletAddress,
		chainId: params.chainId,
		status: params.status,
		message: params.message,
	};
	if (params.externalId) {
		payload.id = params.externalId;
	}

	await requestJson('POST', UPDATE_PATH, payload);
}

async function extendDerivationIndexRange(targetAddresses: Set<string>): Promise<Map<string, number>> {
	const found = new Map<string, number>();
	if (targetAddresses.size === 0) return found;

	const mnemonic = await getMnemonic();
	if (!mnemonic) return found;

	const searchWindow = Number(process.env.DIRECT_SWEEP_DERIVATION_SEARCH_WINDOW || DEFAULT_DIRECT_SWEEP_DERIVATION_SEARCH_WINDOW);
	const maxIndex = Number(process.env.DIRECT_SWEEP_DERIVATION_MAX_INDEX || DEFAULT_DIRECT_SWEEP_DERIVATION_MAX_INDEX);

	const lastDerived = await DerivedKey.findOne().sort({ derivationIndex: -1 }).lean();
	let startIndex = (lastDerived?.derivationIndex ?? -1) + 1;
	if (startIndex > maxIndex) return found;

	const endIndex = Math.min(startIndex + Math.max(1, searchWindow) - 1, maxIndex);
	const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
	const parentNode = hdNode.derivePath("m/44'/60'/0'/0");

	let ops: Array<{ updateOne: { filter: { derivationIndex: number }; update: { $setOnInsert: { address: string; derivationIndex: number } }; upsert: true } }> = [];
	for (let i = startIndex; i <= endIndex; i++) {
		const child = parentNode.derivePath(String(i));
		const addr = child.address.toLowerCase();

		ops.push({
			updateOne: {
				filter: { derivationIndex: i },
				update: { $setOnInsert: { address: addr, derivationIndex: i } },
				upsert: true,
			},
		});

		if (targetAddresses.has(addr)) {
			found.set(addr, i);
		}

		if (ops.length >= DERIVE_BATCH_SIZE) {
			await DerivedKey.bulkWrite(ops as any[], { ordered: false });
			ops = [];
		}

		if (found.size === targetAddresses.size) {
			break;
		}
	}

	if (ops.length > 0) {
		await DerivedKey.bulkWrite(ops as any[], { ordered: false });
	}

	console.log(`[DirectSweeper] Expanded key derivation index from ${startIndex} to ${endIndex}. Found ${found.size}/${targetAddresses.size} missing wallet(s).`);
	return found;
}

async function markFailedAndNotify(
	doc: { _id: unknown; externalId: string; walletAddress: string; chainId: number },
	message: string
): Promise<void> {
	let finalMessage = message;
	try {
		await notifyIntegrationUpdate({
			externalId: doc.externalId,
			walletAddress: doc.walletAddress,
			chainId: doc.chainId,
			status: 'failed',
			message,
		});
	} catch (err: any) {
		finalMessage = `${message}. Callback failed: ${err.message}`;
	}

	await DirectSweepWallet.updateOne(
		{ _id: doc._id },
		{
			$set: {
				status: 'failed',
				integrationUpdateStatus: 'failed',
				integrationUpdateMessage: finalMessage,
				integrationFailureReason: finalMessage,
				integrationUpdatedAt: new Date(),
				lastProcessedAt: new Date(),
				lastError: finalMessage,
			},
		}
	);
}

export async function runDirectSweeperCycle(): Promise<void> {
	if (isDirectSweepRunning) {
		console.log('[DirectSweeper] Previous cycle is still running. Skipping.');
		return;
	}
	isDirectSweepRunning = true;

	try {
		if (getActiveJobId()) {
			console.log('[DirectSweeper] Another sweep job is running. Skipping this cycle.');
			return;
		}

		const [mnemonic, custodial] = await Promise.all([
			getConfig('mnemonic'),
			getConfig('custodialWallet'),
		]);
		if (!mnemonic || !custodial) {
			console.log('[DirectSweeper] Mnemonic or custodial wallet not configured.');
			return;
		}

		const syncResult = await syncDirectWalletQueueFromApi();
		console.log(`[DirectSweeper] Synced ${syncResult.recordsUpserted} records across ${syncResult.pages} page(s).`);

		const pendingDocs = await DirectSweepWallet.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
		if (pendingDocs.length === 0) {
			console.log('[DirectSweeper] No pending wallets to process.');
			return;
		}

		const uniqueAddresses = [...new Set(pendingDocs.map(d => d.walletAddress.toLowerCase()))];
		const derived = await DerivedKey.find({ address: { $in: uniqueAddresses } }).lean();
		const derivationMap = new Map<string, number>();
		for (const d of derived) derivationMap.set(d.address.toLowerCase(), d.derivationIndex);

		const missingAddresses = uniqueAddresses.filter(a => !derivationMap.has(a));
		if (missingAddresses.length > 0) {
			const foundFromExpansion = await extendDerivationIndexRange(new Set(missingAddresses));
			for (const [address, index] of foundFromExpansion.entries()) {
				derivationMap.set(address, index);
			}
		}

		const activeRpcs = await RpcEndpoint.find({ isActive: true }).lean();
		const activeChainSet = new Set<number>(activeRpcs.map(r => r.chainId));

		type JobWallet = { address: string; derivationIndex: number; chainId: number };
		const jobWallets = new Map<string, JobWallet>();
		const queuedForJobIds: string[] = [];

		for (const doc of pendingDocs) {
			const wallet = doc.walletAddress.toLowerCase();
			if (!activeChainSet.has(doc.chainId)) {
				await markFailedAndNotify(doc as any, `Chain ${doc.chainId} is not configured or inactive in sweeper`);
				continue;
			}

			const derivationIndex = derivationMap.get(wallet);
			if (derivationIndex == null) {
				await markFailedAndNotify(doc as any, `Wallet ${wallet} is not derived locally, cannot sign sweep tx`);
				continue;
			}

			queuedForJobIds.push(String(doc._id));
			const key = `${doc.chainId}:${wallet}`;
			if (!jobWallets.has(key)) {
				jobWallets.set(key, { address: wallet, derivationIndex, chainId: doc.chainId });
			}
		}

		if (jobWallets.size === 0) {
			console.log('[DirectSweeper] No sweepable pending wallets after validation.');
			return;
		}

		const targetChainIds = [...new Set([...jobWallets.values()].map(w => w.chainId))];
		const tokens = await TokenContract.find({ isActive: true, chainId: { $in: targetChainIds } }).lean();

		const job = await SweepJob.create({
			mode: 'direct',
			listName: `DIRECT SWEEPER ${new Date().toISOString()}`,
			status: 'pending',
			targetChainIds,
			tokenAddresses: tokens.map((t: any) => t.contractAddress),
			gasLimitPerTx: 65000,
			maxGasPrice: '50',
			batchSize: 20,
			totalWallets: jobWallets.size,
			processedWallets: 0,
			totalTxSent: 0,
			totalTxFailed: 0,
			directWallets: [...jobWallets.values()],
			sweptKeys: [],
			completedTxKeys: [],
			gasFundedKeys: [],
		});

		await DirectSweepWallet.updateMany(
			{ _id: { $in: queuedForJobIds } },
			{ $set: { status: 'processing', sweepJobId: job._id, lastError: null } }
		);

		try {
			await runSweepJob(String(job._id));
		} catch (err: any) {
			console.error(`[DirectSweeper] Job ${job._id} failed:`, err.message);
		}

		const finishedJob = await SweepJob.findById(job._id).lean();
		const failedLogs = await SweepLog.find({ jobId: job._id, status: 'failed' }).lean();
		const failedByWallet = new Map<string, string>();
		for (const log of failedLogs) {
			const key = `${log.chainId}:${String(log.walletAddress).toLowerCase()}`;
			if (!failedByWallet.has(key)) {
				failedByWallet.set(key, log.error || 'One or more sweep transactions failed');
			}
		}

		const sweptSet = new Set<string>((finishedJob?.sweptKeys || []).map((k: string) => k.toLowerCase()));
		const processingDocs = await DirectSweepWallet.find({ sweepJobId: job._id, status: 'processing' }).lean();
		const docsByWalletChain = new Map<string, typeof processingDocs>();
		for (const doc of processingDocs) {
			const key = `${doc.chainId}:${doc.walletAddress.toLowerCase()}`;
			const list = docsByWalletChain.get(key) || [];
			list.push(doc);
			docsByWalletChain.set(key, list);
		}

		for (const [key, docs] of docsByWalletChain.entries()) {
			const doc0 = docs[0];
			const walletFailure = failedByWallet.get(key);
			const wasSwept = sweptSet.has(key);

			let status: 'success' | 'failed' = 'failed';
			let message = finishedJob?.pauseReason || 'Wallet was not processed by sweep job';

			if (walletFailure) {
				status = 'failed';
				message = `Sweep failed: ${walletFailure}`;
			} else if (wasSwept) {
				status = 'success';
				message = 'Direct sweep completed for wallet across configured tokens';
			}

			let callbackError: string | null = null;
			try {
				await notifyIntegrationUpdate({
					walletAddress: doc0.walletAddress,
					chainId: doc0.chainId,
					status,
					message,
				});
			} catch (err: any) {
				callbackError = err.message;
			}

			const finalMessage = callbackError ? `${message}. Callback failed: ${callbackError}` : message;
			const updateManyFilter = { _id: { $in: docs.map(d => d._id) } };
			await DirectSweepWallet.updateMany(
				updateManyFilter,
				{
					$set: {
						status: status === 'success' ? 'completed' : 'failed',
						integrationUpdateStatus: status,
						integrationUpdateMessage: finalMessage,
						integrationFailureReason: status === 'failed' ? finalMessage : null,
						integrationUpdatedAt: new Date(),
						lastProcessedAt: new Date(),
						lastError: status === 'failed' ? finalMessage : null,
					},
				}
			);
		}

		console.log(`[DirectSweeper] Job ${job._id} finished with status ${finishedJob?.status || 'unknown'}.`);
	} finally {
		isDirectSweepRunning = false;
	}
}
