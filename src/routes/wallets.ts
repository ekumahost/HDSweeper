import { Server } from '@hapi/hapi';
import WalletList from '../models/WalletList';
import WalletAddress from '../models/WalletAddress';
import DerivedKey from '../models/DerivedKey';

export function registerWalletRoutes(server: Server): void {
	// List all wallet lists
	server.route({
		method: 'GET',
		path: '/api/wallets/lists',
		handler: async () => {
			const lists = await WalletList.find().sort({ createdAt: -1 });
			return { lists };
		},
	});

	// Get wallet addresses for a list
	server.route({
		method: 'GET',
		path: '/api/wallets/lists/{id}/addresses',
		handler: async (request) => {
			const page = Number(request.query.page) || 1;
			const limit = Math.min(Number(request.query.limit) || 50, 200);
			const skip = (page - 1) * limit;

			const listId = request.params.id;
			const [addresses, total] = await Promise.all([
				WalletAddress.find({ listId }).skip(skip).limit(limit).sort({ derivationIndex: 1 }),
				WalletAddress.countDocuments({ listId }),
			]);

			return { addresses, total, page, limit, pages: Math.ceil(total / limit) };
		},
	});

	// Import wallet addresses
	server.route({
		method: 'POST',
		path: '/api/wallets/import',
		handler: async (request, h) => {
			const { name, description, addresses } = request.payload as any;
			if (!name || !addresses || !Array.isArray(addresses)) {
				return h.response({ error: 'name and addresses[] required' }).code(400);
			}

			// Normalize and deduplicate
			const cleaned = [...new Set(
				addresses
					.map((a: string) => a.trim().toLowerCase())
					.filter((a: string) => /^0x[a-f0-9]{40}$/.test(a))
			)];

			if (cleaned.length === 0) {
				return h.response({ error: 'No valid addresses found' }).code(400);
			}

			// Create list
			const list = await WalletList.create({
				name,
				description: description || '',
				totalAddresses: cleaned.length,
			});

			// Bulk insert addresses
			const docs = cleaned.map((address: string) => ({
				listId: list._id,
				address,
				isMatched: false,
			}));

			await WalletAddress.insertMany(docs, { ordered: false }).catch(() => {});

			// Cross-reference with derived keys to mark matches
			const derivedKeys = await DerivedKey.find({ address: { $in: cleaned } }).lean();
			if (derivedKeys.length > 0) {
				for (const dk of derivedKeys) {
					await WalletAddress.updateMany(
						{ listId: list._id, address: dk.address },
						{ $set: { isMatched: true, derivationIndex: dk.derivationIndex } }
					);
				}
				list.matchedAddresses = derivedKeys.length;
				await list.save();
			}

			return h.response({
				list,
				imported: cleaned.length,
				matched: derivedKeys.length,
			}).code(201);
		},
	});

	// Delete a wallet list
	server.route({
		method: 'DELETE',
		path: '/api/wallets/lists/{id}',
		handler: async (request, h) => {
			const id = request.params.id;
			await WalletAddress.deleteMany({ listId: id });
			await WalletList.findByIdAndDelete(id);
			return { deleted: true };
		},
	});
}
