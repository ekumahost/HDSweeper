import { ethers } from 'ethers';
import SweepJob from '../models/SweepJob';
import SweepLog from '../models/SweepLog';
import WalletAddress from '../models/WalletAddress';
import TokenContract from '../models/TokenContract';
import RpcEndpoint from '../models/RpcEndpoint';
import { getMnemonic } from './keyDerivation';
import { getConfig } from '../models/AppConfig';
import { ERC20_ABI, getProvider, clearProviderForChain } from './blockchain';

const GAS_BUFFER = 1.15; // 15% safety margin on estimates
const FALLBACK_ERC20_GAS = 65_000;
const NATIVE_GAS_LIMIT = 21_000;
const WALLET_BATCH_SIZE = 10; // wallets processed in parallel per chain
const CHECKPOINT_INTERVAL = 20;

// Active job tracking
let activeJobId: string | null = null;
let shouldPause = false;

export function getActiveJobId(): string | null { return activeJobId; }
export function requestPause(): void { shouldPause = true; }

/** On startup, mark any leftover 'running' jobs as paused (server crashed/restarted). */
export async function resetStaleJobs(): Promise<void> {
	const stale = await SweepJob.updateMany(
		{ status: 'running' },
		{ $set: { status: 'paused', pauseReason: 'Server restarted — job was not actively running', pausedAt: new Date() } },
	);
	if (stale.modifiedCount > 0) {
		console.log(`[Sweeper] Reset ${stale.modifiedCount} stale running job(s) to paused`);
	}
}

type WalletEntry = { address: string; derivationIndex: number; chainId?: number };

interface ChainContext {
	chainId: number;
	chainName: string;
	nativeSymbol: string;
	provider: ethers.providers.JsonRpcProvider;
	contracts: Array<{ contractAddress: string; symbol: string; decimals: number }>;
	gasSigner: ethers.Wallet;
	gasFunderAddress: string;
	gasPrice: ethers.BigNumber;
}

// ── Helpers ──

async function estimateERC20Gas(
	contract: ethers.Contract, from: string, to: string, amount: ethers.BigNumber
): Promise<ethers.BigNumber> {
	try {
		const est = await contract.estimateGas.transfer(to, amount, { from });
		return est.mul(Math.ceil(GAS_BUFFER * 100)).div(100);
	} catch {
		return ethers.BigNumber.from(FALLBACK_ERC20_GAS);
	}
}

async function estimateNativeGas(
	provider: ethers.providers.JsonRpcProvider, from: string, to: string, value: ethers.BigNumber
): Promise<ethers.BigNumber> {
	try {
		const est = await provider.estimateGas({ from, to, value });
		return est.mul(Math.ceil(GAS_BUFFER * 100)).div(100);
	} catch {
		return ethers.BigNumber.from(NATIVE_GAS_LIMIT);
	}
}

// ── Sweep a single wallet on a single chain ──

async function sweepWalletOnChain(
	ctx: ChainContext,
	wallet: WalletEntry,
	parentNode: ethers.utils.HDNode,
	destination: string,
	jobId: string,
	txDoneSet: Set<string>,
	gasFundedSet: Set<string>,
	sweptSet: Set<string>,
	jobCounters: { txSent: number; txFailed: number; processed: number },
): Promise<'ok' | 'gas_depleted' | 'paused'> {
	const { chainId, chainName, nativeSymbol, provider, contracts, gasSigner, gasFunderAddress, gasPrice } = ctx;
	const addr = wallet.address.toLowerCase();

	if (shouldPause) return 'paused';
	if (addr === gasFunderAddress) return 'ok';
	if (sweptSet.has(`${chainId}:${addr}`)) return 'ok';
	if (wallet.derivationIndex == null) return 'ok';

	const childNode = parentNode.derivePath(String(wallet.derivationIndex));
	const signer = new ethers.Wallet(childNode.privateKey, provider);

	// ── Phase A: Check which tokens have balance, estimate gas needed ──
	const tokenBalances: Array<{ token: typeof contracts[0]; balance: ethers.BigNumber; gasEst: ethers.BigNumber }> = [];
	let totalGasNeeded = ethers.BigNumber.from(0);

	for (const token of contracts) {
		const txKey = `${chainId}:${addr}:${token.contractAddress}`;
		if (txDoneSet.has(txKey)) continue;

		try {
			const contract = new ethers.Contract(token.contractAddress, ERC20_ABI, signer);
			const balance: ethers.BigNumber = await contract.balanceOf(addr);
			if (balance.isZero()) {
				txDoneSet.add(txKey);
				continue;
			}
			const gasEst = await estimateERC20Gas(contract, addr, destination, balance);
			tokenBalances.push({ token, balance, gasEst });
			totalGasNeeded = totalGasNeeded.add(gasEst.mul(gasPrice));
		} catch {
			// Skip tokens we can't read
		}
	}

	// Add gas for the native sweep tx itself (to send leftover native)
	const nativeGasCost = gasPrice.mul(NATIVE_GAS_LIMIT);
	totalGasNeeded = totalGasNeeded.add(nativeGasCost);

	// Also need gas for the "return leftover gas" tx
	totalGasNeeded = totalGasNeeded.add(nativeGasCost);

	// ── Phase B: Fund gas (only what's needed) ──
	if (!gasFundedSet.has(`${chainId}:${addr}`) && tokenBalances.length > 0) {
		const currentBal = await provider.getBalance(addr);
		if (currentBal.lt(totalGasNeeded)) {
			const toSend = totalGasNeeded.sub(currentBal);

			const funderBal = await provider.getBalance(gasSigner.address);
			if (funderBal.lt(toSend.add(nativeGasCost))) {
				return 'gas_depleted';
			}

			try {
				const tx = await gasSigner.sendTransaction({
					to: addr, value: toSend, gasPrice, gasLimit: NATIVE_GAS_LIMIT,
				});
				await tx.wait(1);
				gasFundedSet.add(`${chainId}:${addr}`);

				await SweepLog.create({
					jobId, chainId, chainName, walletAddress: addr,
					tokenSymbol: nativeSymbol, isNativeToken: true, type: 'gas_fund',
					amount: toSend.toString(), amountFormatted: ethers.utils.formatEther(toSend),
					txHash: tx.hash, status: 'success',
				});
			} catch (err: any) {
				await SweepLog.create({
					jobId, chainId, chainName, walletAddress: addr,
					tokenSymbol: 'GAS_FUND', type: 'gas_fund',
					status: 'failed', error: err.message,
				});
				jobCounters.txFailed++;
				return 'ok'; // skip this wallet but don't halt entire chain
			}
		} else {
			gasFundedSet.add(`${chainId}:${addr}`);
		}
	}

	// ── Phase C: Sweep ERC20 tokens ──
	let nonce = await provider.getTransactionCount(addr, 'pending');

	for (const { token, balance, gasEst } of tokenBalances) {
		if (shouldPause) { sweptSet.add(`${chainId}:${addr}`); jobCounters.processed++; return 'paused'; }
		const txKey = `${chainId}:${addr}:${token.contractAddress}`;
		if (txDoneSet.has(txKey)) continue;

		try {
			const contract = new ethers.Contract(token.contractAddress, ERC20_ABI, signer);
			const tx = await contract.transfer(destination, balance, {
				nonce, gasPrice, gasLimit: gasEst,
			});
			const receipt = await tx.wait(1);

			await SweepLog.create({
				jobId, chainId, chainName, walletAddress: addr,
				tokenSymbol: token.symbol, contractAddress: token.contractAddress,
				type: 'erc20_sweep',
				amount: balance.toString(),
				amountFormatted: ethers.utils.formatUnits(balance, token.decimals),
				txHash: receipt.transactionHash, status: 'success', nonce,
			});
			nonce++;
			txDoneSet.add(txKey);
			jobCounters.txSent++;
		} catch (err: any) {
			await SweepLog.create({
				jobId, chainId, chainName, walletAddress: addr,
				tokenSymbol: token.symbol, contractAddress: token.contractAddress,
				type: 'erc20_sweep', status: 'failed', error: err.message,
			});
			jobCounters.txFailed++;
			nonce++;
		}
	}

	// ── Phase D: Sweep remaining native balance to destination ──
	const nativeTxKey = `${chainId}:${addr}:NATIVE`;
	if (!txDoneSet.has(nativeTxKey)) {
		try {
			const balance = await provider.getBalance(addr);
			const nativeGasEst = await estimateNativeGas(provider, addr, destination, balance);
			const gasCost = gasPrice.mul(nativeGasEst);
			// Keep enough for the return-gas tx
			const returnGasCost = gasPrice.mul(NATIVE_GAS_LIMIT);
			const sendAmount = balance.sub(gasCost).sub(returnGasCost);

			if (sendAmount.gt(0)) {
				const tx = await signer.sendTransaction({
					to: destination, value: sendAmount,
					gasLimit: nativeGasEst, gasPrice, nonce,
				});
				const receipt = await tx.wait(1);

				await SweepLog.create({
					jobId, chainId, chainName, walletAddress: addr,
					tokenSymbol: nativeSymbol, isNativeToken: true, type: 'native_sweep',
					amount: sendAmount.toString(),
					amountFormatted: ethers.utils.formatEther(sendAmount),
					txHash: receipt.transactionHash, status: 'success', nonce,
				});
				jobCounters.txSent++;
				nonce++;
			}
			txDoneSet.add(nativeTxKey);
		} catch (err: any) {
			await SweepLog.create({
				jobId, chainId, chainName, walletAddress: addr,
				tokenSymbol: nativeSymbol, isNativeToken: true, type: 'native_sweep',
				status: 'failed', error: err.message,
			});
			jobCounters.txFailed++;
		}
	}

	// ── Phase E: Return leftover gas back to gas wallet ──
	const returnKey = `${chainId}:${addr}:GAS_RETURN`;
	if (!txDoneSet.has(returnKey)) {
		try {
			const leftover = await provider.getBalance(addr);
			const returnGasEst = await estimateNativeGas(provider, addr, gasFunderAddress, leftover);
			const returnCost = gasPrice.mul(returnGasEst);
			const returnAmt = leftover.sub(returnCost);

			if (returnAmt.gt(0)) {
				const currentNonce = await provider.getTransactionCount(addr, 'pending');
				const tx = await signer.sendTransaction({
					to: gasFunderAddress, value: returnAmt,
					gasLimit: returnGasEst, gasPrice, nonce: currentNonce,
				});
				await tx.wait(1);

				await SweepLog.create({
					jobId, chainId, chainName, walletAddress: addr,
					tokenSymbol: nativeSymbol, isNativeToken: true, type: 'gas_return',
					amount: returnAmt.toString(),
					amountFormatted: ethers.utils.formatEther(returnAmt),
					txHash: tx.hash, status: 'success',
				});
			}
			txDoneSet.add(returnKey);
		} catch (err: any) {
			// Non-critical: dust left behind
			await SweepLog.create({
				jobId, chainId, chainName, walletAddress: addr,
				tokenSymbol: 'GAS_RETURN', type: 'gas_return',
				status: 'failed', error: err.message,
			});
		}
	}

	sweptSet.add(`${chainId}:${addr}`);
	jobCounters.processed++;
	return 'ok';
}

// ── Sweep all wallets on one chain (batched parallel) ──

async function sweepChain(
	ctx: ChainContext,
	wallets: WalletEntry[],
	parentNode: ethers.utils.HDNode,
	destination: string,
	jobId: string,
	txDoneSet: Set<string>,
	gasFundedSet: Set<string>,
	sweptSet: Set<string>,
	jobCounters: { txSent: number; txFailed: number; processed: number },
	saveCheckpoint: () => Promise<void>,
): Promise<'ok' | 'gas_depleted' | 'paused'> {
	for (let i = 0; i < wallets.length; i += WALLET_BATCH_SIZE) {
		if (shouldPause) return 'paused';

		const batch = wallets.slice(i, i + WALLET_BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(w => sweepWalletOnChain(
				ctx, w, parentNode, destination, jobId,
				txDoneSet, gasFundedSet, sweptSet, jobCounters,
			))
		);

		let hasGasDepleted = false;
		let hasPaused = false;
		for (const r of results) {
			if (r.status === 'fulfilled') {
				if (r.value === 'gas_depleted') hasGasDepleted = true;
				if (r.value === 'paused') hasPaused = true;
			}
		}
		if (hasGasDepleted) return 'gas_depleted';
		if (hasPaused || shouldPause) return 'paused';

		// Periodic checkpoint
		if (jobCounters.processed % CHECKPOINT_INTERVAL < WALLET_BATCH_SIZE) {
			await saveCheckpoint();
		}
	}
	return 'ok';
}

// ── Main entry point ──

export async function runSweepJob(jobId: string): Promise<void> {
	if (activeJobId) throw new Error('Another sweep job is already running');
	activeJobId = jobId;
	shouldPause = false;

	const job = await SweepJob.findById(jobId);
	if (!job) throw new Error('Job not found');

	const mnemonic = await getMnemonic();
	if (!mnemonic) throw new Error('Mnemonic not configured');

	const destination = await getConfig('custodialWallet');
	if (!destination) throw new Error('Custodial wallet not configured');

	const gasIndexConfig = await getConfig('gasWalletIndex');
	const gasIndex = gasIndexConfig ?? 0;

	// Derive gas funder key
	const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
	const parentNode = hdNode.derivePath("m/44'/60'/0'/0");
	const gasFunderChild = parentNode.derivePath(String(gasIndex));
	const gasFunderAddress = gasFunderChild.address.toLowerCase();
	const gasFunderKey = gasFunderChild.privateKey;

	// Load wallets: from list, index range, or direct payload
	let wallets: WalletEntry[];

	if (job.mode === 'range' && job.fromIndex != null && job.toIndex != null) {
		wallets = [];
		for (let idx = job.fromIndex; idx <= job.toIndex; idx++) {
			const child = parentNode.derivePath(String(idx));
			wallets.push({ address: child.address.toLowerCase(), derivationIndex: idx });
		}
	} else if (job.mode === 'direct') {
		const directWallets = ((job as any).directWallets || []) as Array<{ address: string; derivationIndex: number; chainId: number }>;
		wallets = directWallets
			.filter(w => typeof w.address === 'string' && w.derivationIndex != null && w.chainId != null)
			.map(w => ({
				address: w.address.toLowerCase(),
				derivationIndex: Number(w.derivationIndex),
				chainId: Number(w.chainId),
			}));
	} else {
		const raw = await WalletAddress.find({ listId: job.listId, isMatched: true }).lean();
		wallets = raw.map(w => ({ address: w.address.toLowerCase(), derivationIndex: (w as any).derivationIndex }));
	}

	if (wallets.length === 0) {
		job.status = 'completed';
		job.completedAt = new Date();
		await job.save();
		activeJobId = null;
		return;
	}

	job.status = 'running';
	job.startedAt = job.startedAt || new Date();
	job.totalWallets = wallets.length;
	await job.save();

	// Build sets from checkpoint
	const sweptSet = new Set(job.sweptKeys || []);
	const txDoneSet = new Set(job.completedTxKeys || []);
	const gasFundedSet = new Set(job.gasFundedKeys || []);
	const jobCounters = { txSent: job.totalTxSent || 0, txFailed: job.totalTxFailed || 0, processed: job.processedWallets || 0 };

	// Get active chains
	const rpcs = await RpcEndpoint.find({ isActive: true, chainId: { $in: job.targetChainIds } }).lean();
	const activeContracts = await TokenContract.find({ isActive: true, chainId: { $in: job.targetChainIds } }).lean();

	// Group contracts by chain
	const contractsByChain = new Map<number, typeof activeContracts>();
	for (const c of activeContracts) {
		const list = contractsByChain.get(c.chainId) || [];
		list.push(c);
		contractsByChain.set(c.chainId, list);
	}

	const saveCheckpoint = async () => {
		job.totalTxSent = jobCounters.txSent;
		job.totalTxFailed = jobCounters.txFailed;
		job.processedWallets = jobCounters.processed;
		job.sweptKeys = [...sweptSet];
		job.completedTxKeys = [...txDoneSet];
		job.gasFundedKeys = [...gasFundedSet];
		await job.save();
	};

	try {
		// Build chain contexts — skip chains with unreachable RPCs
		const chainContexts: ChainContext[] = [];
		const skippedChains: string[] = [];
		for (const rpc of rpcs) {
			const label = `${rpc.chainName || 'Chain ' + rpc.chainId} (${rpc.chainId})`;
			try {
				const provider = await getProvider(rpc.chainId);
				if (!provider) { skippedChains.push(`${label}: no provider`); continue; }
				const chainContracts = contractsByChain.get(rpc.chainId) || [];
				if (chainContracts.length === 0) { skippedChains.push(`${label}: no active tokens`); continue; }

				const gasPrice = await provider.getGasPrice();
				const gasSigner = new ethers.Wallet(gasFunderKey, provider);

				chainContexts.push({
					chainId: rpc.chainId,
					chainName: rpc.chainName || `Chain ${rpc.chainId}`,
					nativeSymbol: rpc.nativeSymbol || 'ETH',
					provider,
					contracts: chainContracts,
					gasSigner,
					gasFunderAddress,
					gasPrice,
				});
			} catch (err: any) {
				skippedChains.push(`${label}: ${err.message || 'connection failed'}`);
				clearProviderForChain(rpc.chainId);
				console.error(`[Sweeper] Skipping ${label}:`, err.message);
			}
		}

		if (chainContexts.length === 0) {
			job.status = 'failed';
			job.pauseReason = 'All chains failed to connect. ' + skippedChains.join('; ');
			job.totalTxSent = jobCounters.txSent;
			job.totalTxFailed = jobCounters.txFailed;
			job.processedWallets = jobCounters.processed;
			await job.save();
			activeJobId = null;
			return;
		}

		if (skippedChains.length > 0) {
			console.warn(`[Sweeper] Skipped chains: ${skippedChains.join('; ')}`);
		}

		// Sweep ALL chains in parallel
		const walletsByChain = new Map<number, WalletEntry[]>();
		if (job.mode === 'direct') {
			for (const wallet of wallets) {
				if (wallet.chainId == null) continue;
				const list = walletsByChain.get(wallet.chainId) || [];
				list.push(wallet);
				walletsByChain.set(wallet.chainId, list);
			}
		}

		const chainResults = await Promise.allSettled(
			chainContexts.map(ctx =>
				sweepChain(
					ctx,
					job.mode === 'direct' ? (walletsByChain.get(ctx.chainId) || []) : wallets,
					parentNode,
					destination,
					jobId,
					txDoneSet, gasFundedSet, sweptSet, jobCounters, saveCheckpoint)
			)
		);

		// Analyze results from all chains
		const depletedChains: string[] = [];
		const failedChains: string[] = [];
		const okChains: string[] = [];
		let anyPaused = false;
		chainResults.forEach((r, i) => {
			const label = `${chainContexts[i].chainName} (${chainContexts[i].chainId})`;
			if (r.status === 'fulfilled') {
				if (r.value === 'gas_depleted') depletedChains.push(label);
				else if (r.value === 'paused') anyPaused = true;
				else okChains.push(label);
			} else if (r.status === 'rejected') {
				failedChains.push(`${label}: ${r.reason?.message || 'unknown error'}`);
			}
		});

		// Add skipped chains (from connection phase) to failed list
		if (skippedChains.length > 0) {
			failedChains.push(...skippedChains);
		}

		const notes: string[] = [];
		if (okChains.length > 0) notes.push(`Completed: ${okChains.join(', ')}`);
		if (depletedChains.length > 0) notes.push(`Gas depleted: ${depletedChains.join(', ')}`);
		if (failedChains.length > 0) notes.push(`Skipped/errors: ${failedChains.join('; ')}`);

		if (shouldPause || anyPaused) {
			job.status = 'paused';
			job.pausedAt = new Date();
			job.pauseReason = `Paused by user. ${jobCounters.processed} of ${job.totalWallets} wallets processed.`;
		} else if (okChains.length > 0 || jobCounters.txSent > 0) {
			// At least some chains succeeded — mark completed with notes
			job.status = 'completed';
			job.completedAt = new Date();
			if (depletedChains.length > 0 || failedChains.length > 0) {
				job.pauseReason = notes.join('. ');
			}
		} else if (depletedChains.length > 0) {
			// ALL chains depleted, nothing completed
			job.status = 'gas_depleted';
			job.pauseReason = notes.join('. ') + '. Fund gas wallet and click Resume.';
			job.pausedAt = new Date();
		} else {
			// ALL chains failed, nothing completed
			job.status = 'failed';
			job.pauseReason = notes.join('. ');
		}
	} catch (err: any) {
		job.status = 'failed';
		job.pauseReason = err.message;
	}

	job.totalTxSent = jobCounters.txSent;
	job.totalTxFailed = jobCounters.txFailed;
	job.processedWallets = jobCounters.processed;
	job.sweptKeys = [...sweptSet];
	job.completedTxKeys = [...txDoneSet];
	job.gasFundedKeys = [...gasFundedSet];
	await job.save();
	activeJobId = null;
}
