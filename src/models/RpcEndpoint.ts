import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		chainId: { type: Number, required: true },
		chainName: { type: String, required: true },
		url: { type: String, required: true },
		isActive: { type: Boolean, default: true },
		nativeSymbol: { type: String, default: 'ETH' },
		explorerUrl: { type: String, default: null },
		latencyMs: { type: Number, default: null },
		lastChecked: { type: Date, default: null },
	},
	{ timestamps: true }
);

schema.index({ chainId: 1 }, { unique: true });

export default mongoose.model('RpcEndpoint', schema);
