import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		listId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletList', required: true, index: true },
		address: { type: String, required: true },
		derivationIndex: { type: Number, default: null },
		isMatched: { type: Boolean, default: false },
		label: { type: String, default: null },
	},
	{ timestamps: true }
);

schema.index({ listId: 1, address: 1 }, { unique: true });
schema.index({ address: 1 });

export default mongoose.model('WalletAddress', schema);
