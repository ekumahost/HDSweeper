import { Server } from '@hapi/hapi';
import TokenContract from '../models/TokenContract';
import { fetchTokenInfo } from '../services/blockchain';

export function registerContractRoutes(server: Server): void {
	// List all token contracts (optionally filter by chainId)
	server.route({
		method: 'GET',
		path: '/api/contracts',
		handler: async (request) => {
			const chainId = request.query.chainId ? Number(request.query.chainId) : null;
			const query = chainId ? { chainId } : {};
			const contracts = await TokenContract.find(query).sort({ chainId: 1, symbol: 1 });
			return { contracts };
		},
	});

	// Add new contract (auto-fetch details from chain)
	server.route({
		method: 'POST',
		path: '/api/contracts',
		handler: async (request, h) => {
			const { chainId, contractAddress } = request.payload as any;
			if (!chainId || !contractAddress) {
				return h.response({ error: 'chainId and contractAddress required' }).code(400);
			}

			// Check duplicate
			const existing = await TokenContract.findOne({ chainId, contractAddress: contractAddress.toLowerCase() });
			if (existing) return h.response({ error: 'Contract already exists', contract: existing }).code(409);

			// Fetch on-chain details
			const info = await fetchTokenInfo(chainId, contractAddress);
			if (!info) {
				return h.response({ error: 'Could not fetch token info from chain. Check contract address and RPC.' }).code(400);
			}

			const contract = await TokenContract.create({
				chainId,
				contractAddress: contractAddress.toLowerCase(),
				symbol: info.symbol,
				name: info.name,
				decimals: info.decimals,
				isActive: true,
				isVerified: true,
				addedBy: 'manual',
			});

			return h.response({ contract }).code(201);
		},
	});

	// Update contract
	server.route({
		method: 'PUT',
		path: '/api/contracts/{id}',
		handler: async (request, h) => {
			const updates = request.payload as any;
			const contract = await TokenContract.findByIdAndUpdate(
				request.params.id,
				{ $set: updates },
				{ new: true }
			);
			if (!contract) return h.response({ error: 'Not found' }).code(404);
			return { contract };
		},
	});

	// Delete contract
	server.route({
		method: 'DELETE',
		path: '/api/contracts/{id}',
		handler: async (request, h) => {
			const result = await TokenContract.findByIdAndDelete(request.params.id);
			if (!result) return h.response({ error: 'Not found' }).code(404);
			return { deleted: true };
		},
	});

	// Validate a contract on-chain
	server.route({
		method: 'POST',
		path: '/api/contracts/validate',
		handler: async (request, h) => {
			const { chainId, contractAddress } = request.payload as any;
			const info = await fetchTokenInfo(chainId, contractAddress);
			if (!info) {
				return h.response({ valid: false, error: 'Could not read contract' }).code(200);
			}
			return { valid: true, ...info };
		},
	});

	// Import contracts from JSON array
	server.route({
		method: 'POST',
		path: '/api/contracts/import',
		handler: async (request, h) => {
			const { contracts } = request.payload as any;
			if (!Array.isArray(contracts)) {
				return h.response({ error: 'contracts must be an array' }).code(400);
			}
			let imported = 0;
			let skipped = 0;
			for (const c of contracts) {
				if (!c.chainId || !c.contractAddress) { skipped++; continue; }
				const exists = await TokenContract.findOne({ chainId: c.chainId, contractAddress: c.contractAddress.toLowerCase() });
				if (exists) { skipped++; continue; }
				await TokenContract.create({
					chainId: c.chainId,
					contractAddress: c.contractAddress.toLowerCase(),
					symbol: c.symbol || 'UNKNOWN',
					name: c.name || '',
					decimals: c.decimals ?? 18,
					isActive: true,
					addedBy: 'import',
				});
				imported++;
			}
			return { imported, skipped };
		},
	});
}
