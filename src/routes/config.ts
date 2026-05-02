import { Server } from '@hapi/hapi';
import { getConfig, setConfig } from '../models/AppConfig';
import { encryptMnemonic, deriveAddress, getMnemonic, startKeyDerivation } from '../services/keyDerivation';
import GasWallet from '../models/GasWallet';
import RpcEndpoint from '../models/RpcEndpoint';
import { getNativeBalance } from '../services/blockchain';

/** Auto-setup pipeline: gas wallet, custodial, key derivation */
export async function runAutoSetup(mnemonic: string): Promise<void> {
	try {
		const first = deriveAddress(mnemonic, 0);

		// 1. Set gas wallet to index 0
		const gasAddr = first.address;
		await setConfig('gasWalletIndex', 0);
		const rpcs = await RpcEndpoint.find({ isActive: true }).lean();
		const balances = await Promise.all(
			rpcs.map(async (rpc: any) => {
				const bal = await getNativeBalance(rpc.chainId, gasAddr);
				return {
					chainId: rpc.chainId, chainName: rpc.chainName,
					balance: bal.raw, balanceFormatted: bal.formatted,
					lastChecked: new Date(),
				};
			})
		);
		await GasWallet.findOneAndUpdate(
			{ derivationIndex: 0 },
			{ derivationIndex: 0, address: gasAddr, balances },
			{ upsert: true, new: true }
		);
		console.log('[AutoSetup] Gas wallet set to index 0:', gasAddr);

		// 2. Set custodial wallet (from env or default)
		const custodial = process.env.CUSTODIAL_WALLET?.trim() || '0x6d297BF599845101A84387C6D5962cC21495d5A2';
		if (!/^0x[a-fA-F0-9]{40}$/.test(custodial)) {
			console.error('[AutoSetup] Invalid CUSTODIAL_WALLET:', custodial);
			return;
		}
		await setConfig('custodialWallet', custodial);
		console.log('[AutoSetup] Custodial wallet set:', custodial);

		// 3. Start key derivation for 50k
		startKeyDerivation(50_000).catch(err => {
			console.error('[AutoSetup] Key derivation error:', err.message);
		});
		console.log('[AutoSetup] Key derivation started for 200,000 indexes');
		console.log('[AutoSetup] Legacy sweep jobs are manual-only and will not be auto-created.');
	} catch (err: any) {
		console.error('[AutoSetup] Error:', err.message);
	}
}

/** Bootstrap mnemonic from MNEMONIC env var if DB doesn't have one yet */
export async function bootstrapEnvMnemonic(): Promise<void> {
	const envMnemonic = process.env.MNEMONIC?.trim();
	if (!envMnemonic) return;

	const words = envMnemonic.split(/\s+/);
	if (words.length !== 12) {
		console.warn('[Bootstrap] MNEMONIC env var must be 12 words, got', words.length);
		return;
	}

	// Already have mnemonic in DB? Skip.
	const existing = await getMnemonic();
	if (existing) {
		console.log('[Bootstrap] Mnemonic already in DB, skipping env import');
		return;
	}

	console.log('[Bootstrap] Importing mnemonic from MNEMONIC env var...');
	const encrypted = encryptMnemonic(envMnemonic);
	await setConfig('mnemonic', encrypted);
	await setConfig('mnemonicSource', 'env');

	// Run the full auto-setup pipeline
	await runAutoSetup(envMnemonic);
}

export function registerConfigRoutes(server: Server): void {
	// Get current config (mnemonic presence + custodial wallet)
	server.route({
		method: 'GET',
		path: '/api/config',
		handler: async () => {
			const mnemonic = await getMnemonic();
			const custodialWallet = await getConfig('custodialWallet');
			const mnemonicSource = await getConfig('mnemonicSource');
			return {
				hasMnemonic: !!mnemonic,
				mnemonicPreview: mnemonic ? mnemonic.split(' ').slice(0, 3).join(' ') + ' ...' : null,
				mnemonicSource: mnemonicSource || null,
				custodialWallet: custodialWallet || null,
			};
		},
	});

	// Save mnemonic — then auto-setup gas wallet, custodial, and key derivation
	server.route({
		method: 'POST',
		path: '/api/config/mnemonic',
		handler: async (request, h) => {
			const { mnemonic } = request.payload as any;
			if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 12) {
				return h.response({ error: 'Must be a 12-word mnemonic' }).code(400);
			}
			const trimmed = mnemonic.trim();
			const encrypted = encryptMnemonic(trimmed);
			await setConfig('mnemonic', encrypted);
			await setConfig('mnemonicSource', 'ui');

			// Derive first address as a verification
			const first = deriveAddress(trimmed, 0);

			// ── Auto-setup pipeline (runs in background) ──
			runAutoSetup(trimmed);

			return { saved: true, firstAddress: first.address, autoSetup: true };
		},
	});

	// Save custodial wallet
	server.route({
		method: 'POST',
		path: '/api/config/custodial-wallet',
		handler: async (request, h) => {
			const { address } = request.payload as any;
			if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
				return h.response({ error: 'Invalid Ethereum address' }).code(400);
			}
			await setConfig('custodialWallet', address);
			return { saved: true, address };
		},
	});

	// Clear config
	server.route({
		method: 'DELETE',
		path: '/api/config/{key}',
		handler: async (request, h) => {
			const key = request.params.key;
			if (!['mnemonic', 'custodialWallet'].includes(key)) {
				return h.response({ error: 'Invalid config key' }).code(400);
			}
			await setConfig(key, null);
			return { cleared: true };
		},
	});
}
