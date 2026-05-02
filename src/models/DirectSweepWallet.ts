import mongoose from 'mongoose';

export type DirectSweepStatus = 'pending' | 'processing' | 'completed' | 'failed';

const schema = new mongoose.Schema(
	{
		externalId: { type: String, required: true },
		walletAddress: { type: String, required: true, lowercase: true, index: true },
		chainId: { type: Number, required: true, index: true },
		chainName: { type: String, default: '' },
		currencySymbol: { type: String, default: '' },
		isNativeToken: { type: Boolean, default: false },
		integrationUpdateStatus: { type: String, default: 'pending' },
		integrationUpdateMessage: { type: String, default: null },
		integrationFailureReason: { type: String, default: null },
		integrationUpdatedAt: { type: Date, default: null },
		status: {
			type: String,
			enum: ['pending', 'processing', 'completed', 'failed'],
			default: 'pending',
			index: true,
		},
		sweepJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'SweepJob', default: null, index: true },
		lastSyncedAt: { type: Date, default: new Date() },
		lastProcessedAt: { type: Date, default: null },
		lastError: { type: String, default: null },
		apiPayload: { type: mongoose.Schema.Types.Mixed, default: null },
	},
	{ timestamps: true }
);

schema.index({ externalId: 1, chainId: 1 }, { unique: true });
schema.index({ walletAddress: 1, chainId: 1 });

export default mongoose.model('DirectSweepWallet', schema);
