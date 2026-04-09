import { Server } from '@hapi/hapi';
import SweepLog from '../models/SweepLog';

export function registerLogRoutes(server: Server): void {
	// List all logs with filters
	server.route({
		method: 'GET',
		path: '/api/logs',
		handler: async (request) => {
			const page = Number(request.query.page) || 1;
			const limit = Math.min(Number(request.query.limit) || 100, 500);
			const skip = (page - 1) * limit;

			const filter: any = {};
			if (request.query.jobId) filter.jobId = request.query.jobId;
			if (request.query.chainId) filter.chainId = Number(request.query.chainId);
			if (request.query.status) filter.status = request.query.status;
			if (request.query.type) filter.type = request.query.type;
			if (request.query.walletAddress) filter.walletAddress = (request.query.walletAddress as string).toLowerCase();
			if (request.query.tokenSymbol) filter.tokenSymbol = request.query.tokenSymbol;

			const [logs, total] = await Promise.all([
				SweepLog.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
				SweepLog.countDocuments(filter),
			]);

			return { logs, total, page, limit, pages: Math.ceil(total / limit) };
		},
	});

	// Get log stats
	server.route({
		method: 'GET',
		path: '/api/logs/stats',
		handler: async (request) => {
			const jobId = request.query.jobId;
			const matchStage: any = {};
			if (jobId) matchStage.jobId = jobId;

			const [statusCounts, typeCounts, chainCounts, totalValue] = await Promise.all([
				SweepLog.aggregate([
					{ $match: matchStage },
					{ $group: { _id: '$status', count: { $sum: 1 } } },
				]),
				SweepLog.aggregate([
					{ $match: matchStage },
					{ $group: { _id: '$type', count: { $sum: 1 } } },
				]),
				SweepLog.aggregate([
					{ $match: matchStage },
					{ $group: { _id: '$chainId', count: { $sum: 1 } } },
				]),
				SweepLog.aggregate([
					{ $match: { ...matchStage, status: 'confirmed' } },
					{ $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
				]),
			]);

			return {
				byStatus: statusCounts,
				byType: typeCounts,
				byChain: chainCounts,
				totalValueSwept: totalValue[0]?.total || 0,
			};
		},
	});

	// Export logs as JSON
	server.route({
		method: 'GET',
		path: '/api/logs/export',
		handler: async (request, h) => {
			const filter: any = {};
			if (request.query.jobId) filter.jobId = request.query.jobId;
			if (request.query.status) filter.status = request.query.status;

			const logs = await SweepLog.find(filter).sort({ createdAt: -1 }).lean();

			return h.response(JSON.stringify(logs, null, 2))
				.type('application/json')
				.header('Content-Disposition', `attachment; filename="sweep-logs-${Date.now()}.json"`);
		},
	});
}
