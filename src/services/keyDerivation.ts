import { ethers } from 'ethers';
import DerivedKey from '../models/DerivedKey';
import WalletAddress from '../models/WalletAddress';
import { getConfig } from '../models/AppConfig';
import crypto from 'crypto';

// Job state (in-memory, one at a time)
let jobState: {
	status: 'idle' | 'running' | 'paused';
	maxIndex: number;
	currentIndex: number;
	matchedCount: number;
	totalDerived: number;
	startedAt: Date | null;
	error: string | null;
} = {
	status: 'idle',
	maxIndex: 0,
	currentIndex: 0,
	matchedCount: 0,
	totalDerived: 0,
	startedAt: null,
	error: null,
};

let shouldPause = false;

export function getKeyDerivationStatus() {
	return { ...jobState };
}

export function pauseKeyDerivation() {
	if (jobState.status === 'running') {
		shouldPause = true;
	}
}

function decryptMnemonic(encrypted: string): string {
	const key = process.env.ENCRYPTION_KEY || '';
	if (!key || key.length < 32) return encrypted; // Fallback: stored as plaintext
	try {
		const [ivHex, encHex] = encrypted.split(':');
		const iv = Buffer.from(ivHex, 'hex');
		const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32), 'utf-8'), iv);
		let decrypted = decipher.update(encHex, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch {
		return encrypted; // Assume plaintext
	}
}

export function encryptMnemonic(mnemonic: string): string {
	const key = process.env.ENCRYPTION_KEY || '';
	if (!key || key.length < 32) return mnemonic;
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32), 'utf-8'), iv);
	let encrypted = cipher.update(mnemonic, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return iv.toString('hex') + ':' + encrypted;
}

/**
 * Derive a single wallet from mnemonic (used for gas wallet preview, etc.)
 */
export function deriveAddress(mnemonic: string, index: number): { address: string; privateKey: string } {
	const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
	const child = hdNode.derivePath(`m/44'/60'/0'/0/${index}`);
	return { address: child.address, privateKey: child.privateKey };
}

/**
 * Get the decrypted mnemonic from DB.
 */
export async function getMnemonic(): Promise<string | null> {
	const encrypted = await getConfig('mnemonic');
	if (!encrypted) return null;
	return decryptMnemonic(encrypted);
}

/**
 * Start bulk key derivation job. Runs in background.
 * Derives parent node once, then loops children — fast.
 * Stores address→index in DerivedKey collection.
 * Cross-references WalletAddress collection to mark matches.
 */
export async function startKeyDerivation(maxIndex: number): Promise<void> {
	if (jobState.status === 'running') throw new Error('Job already running');

	const mnemonic = await getMnemonic();
	if (!mnemonic) throw new Error('Mnemonic not configured');

	shouldPause = false;

	// Check if resuming (find highest index already derived)
	const lastDerived = await DerivedKey.findOne().sort({ derivationIndex: -1 });
	const startFrom = lastDerived ? lastDerived.derivationIndex + 1 : 0;

	jobState = {
		status: 'running',
		maxIndex,
		currentIndex: startFrom,
		matchedCount: 0,
		totalDerived: startFrom,
		startedAt: new Date(),
		error: null,
	};

	// Count existing matches
	jobState.matchedCount = await WalletAddress.countDocuments({ isMatched: true });

	// Load all wallet addresses we need to match against
	const allWalletAddresses = await WalletAddress.distinct('address');
	const targetSet = new Set(allWalletAddresses.map((a: string) => a.toLowerCase()));

	// Derive parent node once
	const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
	const parentNode = hdNode.derivePath("m/44'/60'/0'/0");

	const BATCH_SIZE = 1000;
	let batch: { address: string; derivationIndex: number }[] = [];

	for (let i = startFrom; i <= maxIndex; i++) {
		if (shouldPause) {
			jobState.status = 'paused';
			shouldPause = false;
			// Flush remaining batch
			if (batch.length > 0) await flushBatch(batch, targetSet);
			return;
		}

		const child = parentNode.derivePath(String(i));
		const addr = child.address.toLowerCase();

		batch.push({ address: addr, derivationIndex: i });

		if (batch.length >= BATCH_SIZE) {
			await flushBatch(batch, targetSet);
			batch = [];
		}

		jobState.currentIndex = i;
		jobState.totalDerived = i + 1;
	}

	// Flush final batch
	if (batch.length > 0) await flushBatch(batch, targetSet);

	jobState.status = 'idle';
	jobState.currentIndex = maxIndex;
}

async function flushBatch(
	batch: { address: string; derivationIndex: number }[],
	targetSet: Set<string>
): Promise<void> {
	// Bulk insert derived keys (ignore duplicates)
	const ops = batch.map((item) => ({
		updateOne: {
			filter: { derivationIndex: item.derivationIndex },
			update: { $setOnInsert: { address: item.address, derivationIndex: item.derivationIndex } },
			upsert: true,
		},
	}));
	await DerivedKey.bulkWrite(ops, { ordered: false }).catch(() => {});

	// Check for matches against wallet addresses
	const matchedAddresses = batch
		.filter((item) => targetSet.has(item.address))
		.map((item) => item.address);

	if (matchedAddresses.length > 0) {
		await WalletAddress.updateMany(
			{ address: { $in: matchedAddresses } },
			{ $set: { isMatched: true } }
		);
		// Also set derivation index
		for (const item of batch.filter((b) => targetSet.has(b.address))) {
			await WalletAddress.updateMany(
				{ address: item.address },
				{ $set: { derivationIndex: item.derivationIndex, isMatched: true } }
			);
		}
		jobState.matchedCount += matchedAddresses.length;
	}
}
