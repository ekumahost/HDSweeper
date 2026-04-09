import RpcEndpoint from '../models/RpcEndpoint';
import TokenContract from '../models/TokenContract';
import { setConfig, getConfig } from '../models/AppConfig';

const DEFAULT_RPCS = [
	{ chainId: 1, chainName: 'Ethereum', envKey: 'RPC_ETH', nativeSymbol: 'ETH', explorerUrl: 'https://etherscan.io' },
	{ chainId: 56, chainName: 'BNB Smart Chain', envKey: 'RPC_BSC', nativeSymbol: 'BNB', explorerUrl: 'https://bscscan.com' },
	{ chainId: 42161, chainName: 'Arbitrum One', envKey: 'RPC_ARBITRUM', nativeSymbol: 'ETH', explorerUrl: 'https://arbiscan.io' },
	{ chainId: 8453, chainName: 'Base', envKey: 'RPC_BASE', nativeSymbol: 'ETH', explorerUrl: 'https://basescan.org' },
	{ chainId: 42420, chainName: 'Asset Chain', envKey: 'RPC_ASSETCHAIN', nativeSymbol: 'RWA', explorerUrl: 'https://scan.assetchain.org' },
];

const DEFAULT_TOKENS = [
	// Ethereum (1)
	{ chainId: 1, contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
	{ chainId: 1, contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
	{ chainId: 1, contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
	{ chainId: 1, contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
	{ chainId: 1, contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
	{ chainId: 1, contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
	{ chainId: 1, contractAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
	{ chainId: 1, contractAddress: '0x4563554284aA7148D6E6D0351519E954Ba3B6E02', symbol: 'RWA', name: 'Xend Real World Asset (xRWA)', decimals: 18 },
	{ chainId: 1, contractAddress: '0x9BE89D2a4cd102D8Fecc6BF9dA793be995C22541', symbol: 'BTC', name: 'Bitcoin', decimals: 18 },
	// BSC (56)
	{ chainId: 56, contractAddress: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
	{ chainId: 56, contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18 },
	{ chainId: 56, contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD', name: 'Binance USD', decimals: 18 },
	{ chainId: 56, contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18 },
	{ chainId: 56, contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB', name: 'Bitcoin BEP20', decimals: 18 },
	{ chainId: 56, contractAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH', name: 'Ethereum BEP20', decimals: 18 },
	{ chainId: 56, contractAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', name: 'PancakeSwap', decimals: 18 },
	{ chainId: 56, contractAddress: '0x36fe11b6d5c9421f68d235694fe192b35e803903', symbol: 'RWA', name: 'Xend Real World Asset (xRWA)', decimals: 18 },
	{ chainId: 56, contractAddress: '0x76A797A59Ba2C17726896976B7B3747BfD1d220f', symbol: 'TON', name: 'TONCOIN', decimals: 9 },
	{ chainId: 56, contractAddress: '0x6Ec90334d89dBdc89E08A133271be3d104128Edb', symbol: 'WKC', name: 'Wiki Cat', decimals: 18 },
	{ chainId: 56, contractAddress: '0xa8AEA66B361a8d53e8865c62D142167Af28Af058', symbol: 'cNGN', name: 'Compliant Naira', decimals: 6 },
	{ chainId: 56, contractAddress: '0xeb2B7d5691878627eff20492cA7c9a71228d931D', symbol: 'CREPE', name: 'CREPE', decimals: 9 },
	// Arbitrum (42161)
	{ chainId: 42161, contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
	{ chainId: 42161, contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
	{ chainId: 42161, contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
	{ chainId: 42161, contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
	{ chainId: 42161, contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
	{ chainId: 42161, contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', name: 'Arbitrum', decimals: 18 },
	{ chainId: 42161, contractAddress: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', symbol: 'GMX', name: 'GMX', decimals: 18 },
	{ chainId: 42161, contractAddress: '0x3096e7bfd0878cc65be71f8899bc4cfb57187ba3', symbol: 'RWA', name: 'Xend Real World Asset (xRWA)', decimals: 18 },
	// Base (8453)
	{ chainId: 8453, contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
	{ chainId: 8453, contractAddress: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
	{ chainId: 8453, contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
	{ chainId: 8453, contractAddress: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
	{ chainId: 8453, contractAddress: '0xa753625Acf9afc43a272BA96CB5E620BeFa7625b', symbol: 'RWA', name: 'Xend Real World Asset (xRWA)', decimals: 18 },
	{ chainId: 8453, contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'BTC', name: 'Bitcoin', decimals: 18 },
	{ chainId: 8453, contractAddress: '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F', symbol: 'cNGN', name: 'Compliant Naira', decimals: 6 },
	{ chainId: 8453, contractAddress: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
	// Asset Chain (42420)
	{ chainId: 42420, contractAddress: '0x2B7C1342Cc64add10B2a79C8f9767d2667DE64B2', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
	{ chainId: 42420, contractAddress: '0x26E490d30e73c36800788DC6d6315946C4BbEa24', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
	{ chainId: 42420, contractAddress: '0x7923C0f6FA3d1BA6EAFCAedAaD93e737Fd22FC4F', symbol: 'cNGN', name: 'Compliant Naira', decimals: 6 },
	{ chainId: 42420, contractAddress: '0xEc6943BB984AED25eC96986898721a7f8aB6212E', symbol: 'WNT', name: 'Wicrypt Network Token', decimals: 18 },
	{ chainId: 42420, contractAddress: '0x02afe9989D86a0357fbb238579FE035dc17BcAB0', symbol: 'RWA', name: 'Xend Real World Asset (xRWA)', decimals: 18 },
	{ chainId: 42420, contractAddress: '0xf20f989CAf263C513f9183B4Fed88F14Fc04c8dB', symbol: 'SHALOM', name: 'Shalom Token', decimals: 18 },
];

export async function seedData(): Promise<void> {
	console.log('[Seed] Seeding RPCs...');
	let seededRpcs = 0;
	for (const rpc of DEFAULT_RPCS) {
		const url = process.env[rpc.envKey]?.trim();
		if (!url) {
			console.log(`[Seed] Skipping ${rpc.chainName} — ${rpc.envKey} not set in .env`);
			continue;
		}
		const { envKey, ...rpcData } = rpc;
		await RpcEndpoint.updateOne(
			{ chainId: rpc.chainId },
			{ $setOnInsert: { ...rpcData, url } },
			{ upsert: true }
		);
		seededRpcs++;
	}
	console.log(`[Seed] ${seededRpcs}/${DEFAULT_RPCS.length} RPCs seeded.`);

	console.log('[Seed] Seeding token contracts...');
	for (const token of DEFAULT_TOKENS) {
		await TokenContract.updateOne(
			{ chainId: token.chainId, contractAddress: token.contractAddress },
			{ $setOnInsert: { ...token, isActive: true, isVerified: true, addedBy: 'seed' } },
			{ upsert: true }
		);
	}
	console.log(`[Seed] ${DEFAULT_TOKENS.length} token contracts seeded.`);

	// Seed custodial wallet if not already set
	const custodial = process.env.CUSTODIAL_WALLET?.trim() || '0x6d297BF599845101A84387C6D5962cC21495d5A2';
	const existing = await getConfig('custodialWallet');
	if (!existing) {
		await setConfig('custodialWallet', custodial);
		console.log('[Seed] Custodial wallet seeded.');
	}
}
