import { Server } from '@hapi/hapi';
import RpcEndpoint from '../models/RpcEndpoint';
import TokenContract from '../models/TokenContract';
import DerivedKey from '../models/DerivedKey';
import { getNativeBalance, getTokenBalance } from '../services/blockchain';

export function registerBalanceRoutes(server: Server): void {
	// Get all balances for a wallet address across all active chains/tokens
	server.route({
		method: 'GET',
		path: '/api/balances/{address}',
		handler: async (request, h) => {
			const address = (request.params as any).address;
			if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
				return h.response({ error: 'Invalid address' }).code(400);
			}

			// Find derivation index if known
			const dk = await DerivedKey.findOne({ address: address.toLowerCase() }).lean();
			const derivationIndex = dk ? (dk as any).derivationIndex : null;

			const rpcs = await RpcEndpoint.find({ isActive: true }).lean();
			const tokens = await TokenContract.find({ isActive: true }).lean();

			// Group tokens by chainId
			const tokensByChain: Record<number, any[]> = {};
			for (const t of tokens) {
				const cid = (t as any).chainId;
				if (!tokensByChain[cid]) tokensByChain[cid] = [];
				tokensByChain[cid].push(t);
			}

			// Fetch balances for each chain in parallel
			const chains = await Promise.allSettled(
				rpcs.map(async (rpc: any) => {
					const chainId = rpc.chainId;
					const native = await getNativeBalance(chainId, address);

					const chainTokens = tokensByChain[chainId] || [];
					const tokenBalances = await Promise.allSettled(
						chainTokens.map(async (tok: any) => {
							const bal = await getTokenBalance(chainId, tok.contractAddress, address, tok.decimals);
							return {
								symbol: tok.symbol,
								name: tok.name,
								contractAddress: tok.contractAddress,
								decimals: tok.decimals,
								balance: bal.formatted,
								raw: bal.raw,
							};
						})
					);

					const resolvedTokens = tokenBalances
						.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
						.map((r) => r.value);

					return {
						chainId,
						chainName: rpc.chainName,
						nativeSymbol: rpc.nativeSymbol || 'ETH',
						nativeBalance: native.formatted,
						nativeRaw: native.raw,
						tokens: resolvedTokens,
					};
				})
			);

			const results = chains
				.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
				.map((r) => r.value);

			return { address, derivationIndex, chains: results };
		},
	});
}
