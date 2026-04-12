import 'dotenv/config';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Path from 'path';
import { connectDatabase } from './config/database';
import { seedData } from './config/seed';
import { registerAllRoutes } from './routes';
import { startCron } from './services/cron';
import { bootstrapEnvMnemonic } from './routes/config';
import { resetStaleJobs } from './services/sweeper';

async function start(): Promise<void> {
	const server = Hapi.server({
		port: Number(process.env.PORT) || 4900,
		host: process.env.HOST || '127.0.0.1',
		routes: {
			files: { relativeTo: Path.join(__dirname, 'public') },
			cors: true,
			payload: {
				maxBytes: 10 * 1024 * 1024, // 10 MB for large wallet imports
			},
			state: {
				parse: false,
				failAction: 'ignore',
			},
		},
	});

	// Register @hapi/inert for static files
	await server.register(Inert);

	// API routes
	registerAllRoutes(server);

	// Serve static UI files
	server.route({
		method: 'GET',
		path: '/{param*}',
		handler: {
			directory: {
				path: '.',
				index: ['index.html'],
			},
		},
	});

	// Connect to MongoDB then seed defaults
	await connectDatabase();
	await seedData();

	// Reset any jobs stuck in 'running' from a previous crash/restart
	await resetStaleJobs();

	// If MNEMONIC env var is set and DB is empty, import + auto-setup
	await bootstrapEnvMnemonic();

	await server.start();
	console.log(`\n  HDSWEEPER running at ${server.info.uri}\n`);

	// Start cron: auto-create & run sweep job every 6 hours
	startCron();
}

start().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
