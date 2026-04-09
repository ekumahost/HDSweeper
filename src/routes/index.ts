import { Server } from '@hapi/hapi';
import { registerConfigRoutes } from './config';
import { registerGasRoutes } from './gas';
import { registerContractRoutes } from './contracts';
import { registerRpcRoutes } from './rpcs';
import { registerKeyRoutes } from './keys';
import { registerWalletRoutes } from './wallets';
import { registerSweepRoutes } from './sweep';
import { registerLogRoutes } from './logs';
import { registerBalanceRoutes } from './balances';

export function registerAllRoutes(server: Server): void {
	registerConfigRoutes(server);
	registerGasRoutes(server);
	registerContractRoutes(server);
	registerRpcRoutes(server);
	registerKeyRoutes(server);
	registerWalletRoutes(server);
	registerSweepRoutes(server);
	registerLogRoutes(server);
	registerBalanceRoutes(server);
}
