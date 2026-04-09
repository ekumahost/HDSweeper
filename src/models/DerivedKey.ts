import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		address: { type: String, required: true, unique: true },
		derivationIndex: { type: Number, required: true, unique: true },
	},
	{ timestamps: true }
);

schema.index({ address: 1 }, { unique: true });

export default mongoose.model('DerivedKey', schema);
