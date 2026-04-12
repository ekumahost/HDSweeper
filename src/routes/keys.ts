import { Server } from '@hapi/hapi';
import { getKeyDerivationStatus, pauseKeyDerivation, startKeyDerivation } from '../services/keyDerivation';
import DerivedKey from '../models/DerivedKey';

export function registerKeyRoutes(server: Server): void {
	// Get derivation job status
	server.route({
		method: 'GET',
		path: '/api/keys/status',
		handler: async () => {
			const status = getKeyDerivationStatus();
			const totalStored = await DerivedKey.countDocuments();
			return { ...status, totalStored };
		},
	});

	// Start key derivation
	server.route({
		method: 'POST',
		path: '/api/keys/start',
		handler: async (request, h) => {
			const { maxIndex } = request.payload as any;
			const max = Number(maxIndex) || 50_000;

			try {
				// Start in background
				startKeyDerivation(max).catch((err) => {
					console.error('[KeyDerivation] Job error:', err.message);
				});
				return { started: true, maxIndex: max };
			} catch (err: any) {
				return h.response({ error: err.message }).code(400);
			}
		},
	});

	// Pause key derivation
	server.route({
		method: 'POST',
		path: '/api/keys/pause',
		handler: async () => {
			pauseKeyDerivation();
			return { paused: true };
		},
	});

	// List derived keys with pagination and search
	server.route({
		method: 'GET',
		path: '/api/keys/list',
		handler: async (request) => {
			const q = request.query as any;
			const page = Math.max(1, Number(q.page) || 1);
			const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
			const search = (q.search || '').trim();

			const filter: any = {};
			if (search) {
				if (/^0x[0-9a-fA-F]+$/i.test(search)) {
					filter.address = new RegExp(search, 'i');
				} else if (/^\d+$/.test(search)) {
					filter.derivationIndex = Number(search);
				} else {
					filter.address = new RegExp(search, 'i');
				}
			}

			const total = await DerivedKey.countDocuments(filter);
			const totalPages = Math.ceil(total / limit) || 1;
			const keys = await DerivedKey.find(filter)
				.sort({ derivationIndex: 1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.lean();

			return { keys, total, page, totalPages, limit };
		},
	});

	// Reset derived keys
	server.route({
		method: 'DELETE',
		path: '/api/keys/reset',
		handler: async () => {
			const status = getKeyDerivationStatus();
			if (status.status === 'running') {
				return { error: 'Cannot reset while job is running. Pause first.' };
			}
			await DerivedKey.deleteMany({});
			return { reset: true };
		},
	});
}
