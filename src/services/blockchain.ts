import { ethers } from 'ethers';
import RpcEndpoint from '../models/RpcEndpoint';

const ERC20_ABI = [
	'function balanceOf(address) view returns (uint256)',
	'function transfer(address to, uint256 amount) returns (bool)',
	'function symbol() view returns (string)',
	'function name() view returns (string)',
	'function decimals() view returns (uint8)',
];

// Cache providers to avoid re-creating
const providerCache: Map<number, ethers.providers.JsonRpcProvider> = new Map();

export async function getProvider(chainId: number): Promise<ethers.providers.JsonRpcProvider | null> {
	// Try cached provider first
	if (providerCache.has(chainId)) {
		const cached = providerCache.get(chainId)!;
		try {
			await cached.getNetwork();
			return cached;
		} catch {
			// Stale or dead connection — evict and recreate
			providerCache.delete(chainId);
		}
	}

	const rpc = await RpcEndpoint.findOne({ chainId, isActive: true });
	if (!rpc) return null;

	const provider = new ethers.providers.JsonRpcProvider({
		url: rpc.url,
		timeout: 15_000, // 15s timeout per RPC call
	});
	try {
		// Force network detection now so we fail fast
		await provider.getNetwork();
	} catch (err: any) {
		console.error(`[RPC] Failed to connect to ${rpc.chainName} (${chainId}): ${err.message}`);
		return null;
	}
	providerCache.set(chainId, provider);
	return provider;
}

export function clearProviderCache(): void {
	providerCache.clear();
}

export function clearProviderForChain(chainId: number): void {
	providerCache.delete(chainId);
}

export async function getNativeBalance(chainId: number, address: string): Promise<{ raw: string; formatted: string }> {
	const provider = await getProvider(chainId);
	if (!provider) return { raw: '0', formatted: '0' };
	try {
		const bal = await provider.getBalance(address);
		return { raw: bal.toString(), formatted: ethers.utils.formatEther(bal) };
	} catch {
		return { raw: '0', formatted: '0' };
	}
}

export async function getTokenBalance(
	chainId: number,
	tokenAddress: string,
	walletAddress: string,
	decimals: number = 18
): Promise<{ raw: string; formatted: string }> {
	const provider = await getProvider(chainId);
	if (!provider) return { raw: '0', formatted: '0' };
	try {
		const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
		const bal = await contract.balanceOf(walletAddress);
		return { raw: bal.toString(), formatted: ethers.utils.formatUnits(bal, decimals) };
	} catch {
		return { raw: '0', formatted: '0' };
	}
}

export async function fetchTokenInfo(
	chainId: number,
	contractAddress: string
): Promise<{ symbol: string; name: string; decimals: number } | null> {
	const provider = await getProvider(chainId);
	if (!provider) return null;
	try {
		const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
		const [symbol, name, decimals] = await Promise.all([
			contract.symbol(),
			contract.name(),
			contract.decimals(),
		]);
		return { symbol, name, decimals };
	} catch {
		return null;
	}
}

export async function testRpcConnection(url: string): Promise<{ ok: boolean; latencyMs: number; chainId?: number; error?: string }> {
	const start = Date.now();
	try {
		const provider = new ethers.providers.JsonRpcProvider(url);
		const network = await provider.getNetwork();
		return { ok: true, latencyMs: Date.now() - start, chainId: network.chainId };
	} catch (err: any) {
		return { ok: false, latencyMs: Date.now() - start, error: err.message };
	}
}

export async function getGasPrice(chainId: number): Promise<ethers.BigNumber | null> {
	const provider = await getProvider(chainId);
	if (!provider) return null;
	try {
		return await provider.getGasPrice();
	} catch {
		return null;
	}
}

export { ERC20_ABI };
