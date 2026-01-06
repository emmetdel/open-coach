// Server hooks - runs on every request
import type { Handle } from '@sveltejs/kit';
import { getSQLiteDatabase } from '$lib/server/sqlite';
import { startCronJobs } from '$lib/server/cron';

// Start cron jobs once when server starts
let cronStarted = false;
if (!cronStarted && typeof process !== 'undefined') {
	cronStarted = true;
	// Delay to ensure server is ready
	setTimeout(() => {
		if (process.env.ENABLE_CRON !== 'false') {
			startCronJobs();
		}
	}, 1000);
}

export const handle: Handle = async ({ event, resolve }) => {
	// Inject database into locals for all routes
	event.locals.db = getSQLiteDatabase();
	
	return resolve(event);
};
