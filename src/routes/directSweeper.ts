import { Server } from '@hapi/hapi';
import {
	DEFAULT_DIRECT_SWEEP_HOUR_UTC,
	DEFAULT_DIRECT_SWEEP_MINUTE_UTC,
} from '../config/directSweeperDefaults';
import { getConfig, setConfig } from '../models/AppConfig';
import { runDirectSweeperCycle } from '../services/directSweeper';

const DIRECT_SWEEPER_ENABLED_KEY = 'directSweeperEnabled';

export function registerDirectSweeperRoutes(server: Server): void {
	server.route({
		method: 'GET',
		path: '/api/direct-sweeper/status',
		handler: async () => {
			const enabled = Boolean(await getConfig(DIRECT_SWEEPER_ENABLED_KEY));
			const scheduleHourUtc = Number(process.env.DIRECT_SWEEP_HOUR_UTC || DEFAULT_DIRECT_SWEEP_HOUR_UTC);
			const scheduleMinuteUtc = Number(process.env.DIRECT_SWEEP_MINUTE_UTC || DEFAULT_DIRECT_SWEEP_MINUTE_UTC);
			return {
				enabled,
				schedule: {
					hourUtc: scheduleHourUtc,
					minuteUtc: scheduleMinuteUtc,
				},
			};
		},
	});

	server.route({
		method: 'POST',
		path: '/api/direct-sweeper/start',
		handler: async () => {
			await setConfig(DIRECT_SWEEPER_ENABLED_KEY, true);

			// Fire and forget: route returns immediately while the cycle runs.
			runDirectSweeperCycle().catch((err: any) => {
				console.error('[DirectSweeperRoute] Failed to run initial cycle:', err.message);
			});

			return {
				started: true,
				enabled: true,
				message: 'DIRECT SWEEPER enabled. It will continue daily at the configured 7AM schedule.',
			};
		},
	});
}
