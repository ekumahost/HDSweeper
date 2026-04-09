import mongoose from 'mongoose';

const schema = new mongoose.Schema(
	{
		key: { type: String, required: true, unique: true },
		value: { type: mongoose.Schema.Types.Mixed, required: true },
	},
	{ timestamps: true }
);

const AppConfig = mongoose.model('AppConfig', schema);
export default AppConfig;

// Helper: get/set config values
export async function getConfig(key: string): Promise<any> {
	const doc = await AppConfig.findOne({ key });
	return doc?.value ?? null;
}

export async function setConfig(key: string, value: any): Promise<void> {
	await AppConfig.updateOne({ key }, { $set: { value } }, { upsert: true });
}
