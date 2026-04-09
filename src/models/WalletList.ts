import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		name: { type: String, required: true },
		description: { type: String, default: '' },
		totalAddresses: { type: Number, default: 0 },
		matchedAddresses: { type: Number, default: 0 },
		sweptAddresses: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

export default mongoose.model('WalletList', schema);
