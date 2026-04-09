import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/HDSweeper';

export async function connectDatabase(): Promise<void> {
	try {
		await mongoose.connect(MONGODB_URI);
		console.log(`[DB] Connected to ${MONGODB_URI}`);
	} catch (err) {
		console.error('[DB] Connection failed:', err);
		process.exit(1);
	}
}
