import { Server } from '@hapi/hapi';
import RpcEndpoint from '../models/RpcEndpoint';
import { testRpcConnection, clearProviderCache } from '../services/blockchain';

export function registerRpcRoutes(server: Server): void {
	// List all RPCs
	server.route({
		method: 'GET',
		path: '/api/rpcs',
		handler: async () => {
			const rpcs = await RpcEndpoint.find().sort({ chainId: 1 });
			return { rpcs };
		},
	});

	// Add new RPC
	server.route({
		method: 'POST',
		path: '/api/rpcs',
		handler: async (request, h) => {
			const { chainId, chainName, url, nativeSymbol, explorerUrl } = request.payload as any;
			if (!chainId || !url || !chainName) {
				return h.response({ error: 'chainId, chainName, and url required' }).code(400);
			}
			const existing = await RpcEndpoint.findOne({ chainId });
			if (existing) return h.response({ error: 'RPC for this chainId already exists' }).code(409);

			const rpc = await RpcEndpoint.create({ chainId, chainName, url, nativeSymbol, explorerUrl });
			clearProviderCache();
			return h.response({ rpc }).code(201);
		},
	});

	// Update RPC
	server.route({
		method: 'PUT',
		path: '/api/rpcs/{id}',
		handler: async (request, h) => {
			const updates = request.payload as any;
			const rpc = await RpcEndpoint.findByIdAndUpdate(request.params.id, { $set: updates }, { new: true });
			if (!rpc) return h.response({ error: 'Not found' }).code(404);
			clearProviderCache();
			return { rpc };
		},
	});

	// Delete RPC
	server.route({
		method: 'DELETE',
		path: '/api/rpcs/{id}',
		handler: async (request, h) => {
			const result = await RpcEndpoint.findByIdAndDelete(request.params.id);
			if (!result) return h.response({ error: 'Not found' }).code(404);
			clearProviderCache();
			return { deleted: true };
		},
	});

	// Test RPC connection
	server.route({
		method: 'POST',
		path: '/api/rpcs/test',
		handler: async (request) => {
			const { url } = request.payload as any;
			const result = await testRpcConnection(url);
			if (result.ok) {
				// Update latency in DB if we can find it
				await RpcEndpoint.updateOne({ url }, { $set: { latencyMs: result.latencyMs, lastChecked: new Date() } });
			}
			return result;
		},
	});
}
