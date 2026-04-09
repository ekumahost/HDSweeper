import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		chainId: { type: Number, required: true, index: true },
		contractAddress: { type: String, required: true },
		symbol: { type: String, required: true },
		name: { type: String, default: '' },
		decimals: { type: Number, default: 18 },
		isActive: { type: Boolean, default: true },
		isVerified: { type: Boolean, default: false },
		addedBy: { type: String, default: 'manual' }, // 'seed' | 'manual' | 'import'
	},
	{ timestamps: true }
);

schema.index({ chainId: 1, contractAddress: 1 }, { unique: true });

export default mongoose.model('TokenContract', schema);
