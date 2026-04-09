import mongoose from 'mongoose';

export type SweepJobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'gas_depleted';

const schema = new mongoose.Schema(
	{
		mode: { type: String, enum: ['list', 'range'], default: 'list' },
		listId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletList', default: null },
		listName: { type: String, default: '' },
		fromIndex: { type: Number, default: null },
		toIndex: { type: Number, default: null },
		status: {
			type: String,
			enum: ['pending', 'running', 'paused', 'completed', 'failed', 'gas_depleted'],
			default: 'pending',
		},
		// Chains to sweep
		targetChainIds: [{ type: Number }],
		// Progress
		totalWallets: { type: Number, default: 0 },
		processedWallets: { type: Number, default: 0 },
		totalTxSent: { type: Number, default: 0 },
		totalTxFailed: { type: Number, default: 0 },
		totalUSDSwept: { type: Number, default: 0 },
		// Pause/resume state
		currentChainId: { type: Number, default: null },
		currentWalletAddress: { type: String, default: null },
		pauseReason: { type: String, default: null },
		// Timing
		startedAt: { type: Date, default: null },
		completedAt: { type: Date, default: null },
		pausedAt: { type: Date, default: null },
		// Swept wallets tracker (chainId:address keys)
		sweptKeys: [{ type: String }],
		// Gas funded wallets (chainId:address keys)
		gasFundedKeys: [{ type: String }],
		// Completed tx keys (chainId:address:tokenKey)
		completedTxKeys: [{ type: String }],
	},
	{ timestamps: true }
);

schema.index({ status: 1 });

export default mongoose.model('SweepJob', schema);
