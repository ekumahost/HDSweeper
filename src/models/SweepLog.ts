import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'SweepJob', required: true, index: true },
		chainId: { type: Number, required: true },
		chainName: { type: String, default: '' },
		walletAddress: { type: String, required: true },
		tokenSymbol: { type: String, required: true },
		contractAddress: { type: String, default: null },
		isNativeToken: { type: Boolean, default: false },
		type: { type: String, enum: ['gas_fund', 'erc20_sweep', 'native_sweep', 'funder_sweep'], required: true },
		amount: { type: String, default: '0' },
		amountFormatted: { type: String, default: '0' },
		usdValue: { type: Number, default: 0 },
		txHash: { type: String, default: null },
		status: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
		error: { type: String, default: null },
		gasUsed: { type: String, default: null },
		nonce: { type: Number, default: null },
	},
	{ timestamps: true }
);

schema.index({ jobId: 1, createdAt: -1 });
schema.index({ chainId: 1, walletAddress: 1 });

export default mongoose.model('SweepLog', schema);
