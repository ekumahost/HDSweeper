import { Server } from '@hapi/hapi';
import { getConfig, setConfig } from '../models/AppConfig';
import GasWallet from '../models/GasWallet';
import RpcEndpoint from '../models/RpcEndpoint';
import { deriveAddress, getMnemonic } from '../services/keyDerivation';
import { getNativeBalance } from '../services/blockchain';

export function registerGasRoutes(server: Server): void {
	// Get gas wallet config
	server.route({
		method: 'GET',
		path: '/api/gas',
		handler: async () => {
			const gasIndex = await getConfig('gasWalletIndex');
			const gasWallet = await GasWallet.findOne().sort({ updatedAt: -1 });
			return {
				derivationIndex: gasIndex ?? null,
				wallet: gasWallet || null,
			};
		},
	});

	// Set gas wallet derivation index + check balances
	server.route({
		method: 'POST',
		path: '/api/gas/set-index',
		handler: async (request, h) => {
			const { index } = request.payload as any;
			if (index == null || index < 0) {
				return h.response({ error: 'Invalid index' }).code(400);
			}

			const mnemonic = await getMnemonic();
			if (!mnemonic) return h.response({ error: 'Mnemonic not configured' }).code(400);

			const derived = deriveAddress(mnemonic, index);
			await setConfig('gasWalletIndex', index);

			// Check balances on all active chains
			const rpcs = await RpcEndpoint.find({ isActive: true }).lean();
			const balances = await Promise.all(
				rpcs.map(async (rpc) => {
					const bal = await getNativeBalance(rpc.chainId, derived.address);
					return {
						chainId: rpc.chainId,
						chainName: rpc.chainName,
						balance: bal.raw,
						balanceFormatted: bal.formatted,
						lastChecked: new Date(),
					};
				})
			);

			// Save to DB
			await GasWallet.findOneAndUpdate(
				{ derivationIndex: index },
				{ derivationIndex: index, address: derived.address, balances },
				{ upsert: true, new: true }
			);

			return { derivationIndex: index, address: derived.address, balances };
		},
	});

	// Refresh gas balances
	server.route({
		method: 'POST',
		path: '/api/gas/refresh',
		handler: async (request, h) => {
			const gasWallet = await GasWallet.findOne().sort({ updatedAt: -1 });
			if (!gasWallet) return h.response({ error: 'Gas wallet not configured' }).code(400);

			const rpcs = await RpcEndpoint.find({ isActive: true }).lean();
			const balances = await Promise.all(
				rpcs.map(async (rpc) => {
					const bal = await getNativeBalance(rpc.chainId, gasWallet.address);
					return {
						chainId: rpc.chainId,
						chainName: rpc.chainName,
						balance: bal.raw,
						balanceFormatted: bal.formatted,
						lastChecked: new Date(),
					};
				})
			);

			gasWallet.balances = balances;
			await gasWallet.save();

			return { address: gasWallet.address, balances };
		},
	});

	// Delete gas wallet config
	server.route({
		method: 'DELETE',
		path: '/api/gas',
		handler: async () => {
			await GasWallet.deleteMany({});
			await setConfig('gasWalletIndex', null);
			return { deleted: true };
		},
	});
}
