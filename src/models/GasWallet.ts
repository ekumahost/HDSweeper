import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		derivationIndex: { type: Number, required: true },
		address: { type: String, required: true },
		balances: [
			{
				chainId: { type: Number },
				chainName: { type: String },
				balance: { type: String, default: '0' },
				balanceFormatted: { type: String, default: '0' },
				lastChecked: { type: Date, default: null },
			},
		],
	},
	{ timestamps: true }
);

export default mongoose.model('GasWallet', schema);
