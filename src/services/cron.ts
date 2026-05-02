import { runDirectSweeperCycle } from './directSweeper';
import { getConfig } from '../models/AppConfig';
import {
	DEFAULT_DIRECT_SWEEP_HOUR_UTC,
	DEFAULT_DIRECT_SWEEP_MINUTE_UTC,
} from '../config/directSweeperDefaults';

const DIRECT_SWEEPER_ENABLED_KEY = 'directSweeperEnabled';

let nextRunTimer: ReturnType<typeof setTimeout> | null = null;

function getNextRunDelayMs(hour: number, minute: number): number {
	const now = new Date();
	const next = new Date(now);
	next.setUTCHours(hour, minute, 0, 0);
	if (next.getTime() <= now.getTime()) {
		next.setUTCDate(next.getUTCDate() + 1);
	}
	return next.getTime() - now.getTime();
}

async function runScheduledDirectSweep(): Promise<void> {
	try {
		const enabled = Boolean(await getConfig(DIRECT_SWEEPER_ENABLED_KEY));
		if (!enabled) {
			console.log('[Cron] DIRECT SWEEPER is disabled in DB. Skipping run.');
			return;
		}
		await runDirectSweeperCycle();
	} catch (err: any) {
		console.error('[Cron] Direct sweeper cycle failed:', err.message);
	}
}

function scheduleDailyDirectSweep(hour: number, minute: number): void {
	const delay = getNextRunDelayMs(hour, minute);
	const runAt = new Date(Date.now() + delay);
	console.log(`[Cron] Next DIRECT SWEEPER run scheduled at ${runAt.toISOString()}`);

	nextRunTimer = setTimeout(async () => {
		await runScheduledDirectSweep();
		scheduleDailyDirectSweep(hour, minute);
	}, delay);
}

export function startCron(): void {
	const enableCron = process.env.ENABLE_CRON?.toLowerCase() !== 'false';
	const scheduleHour = Number(process.env.DIRECT_SWEEP_HOUR_UTC || DEFAULT_DIRECT_SWEEP_HOUR_UTC);
	const scheduleMinute = Number(process.env.DIRECT_SWEEP_MINUTE_UTC || DEFAULT_DIRECT_SWEEP_MINUTE_UTC);

	if (!enableCron) {
		console.log('[Cron] Disabled via ENABLE_CRON=false.');
		return;
	}

	if (nextRunTimer) return;
	console.log(`[Cron] DIRECT SWEEPER daily schedule set to ${scheduleHour.toString().padStart(2, '0')}:${scheduleMinute.toString().padStart(2, '0')} UTC.`);

	// Run once on boot only if the persistent DB toggle is enabled.
	runScheduledDirectSweep().catch(err => console.error('[Cron] Error:', err.message));

	scheduleDailyDirectSweep(scheduleHour, scheduleMinute);
}

export function stopCron(): void {
	if (nextRunTimer) {
		clearTimeout(nextRunTimer);
		nextRunTimer = null;
	}
}
