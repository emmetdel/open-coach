// Cron handler for scheduled Garmin sync
// Triggered every 4 hours by node-cron

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRecentRuns } from '$lib/server/garmin';
import { analyzeRun } from '$lib/server/coach';
import {
	getExistingActivityIds,
	insertRun,
	updateRunFeedback,
	hasCompletedSetup
} from '$lib/server/db';
import { isCronAuthorized } from '$lib/server/cronAuth';

export const GET: RequestHandler = async ({ locals, request }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Verify cron secret
	if (!isCronAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db);
	if (!isSetup) {
		return json({
			success: false,
			message: 'Setup not complete, skipping sync'
		});
	}

	try {
		// Fetch recent runs from Garmin
		const recentRuns = await fetchRecentRuns(db, 5);

		// Get existing activity IDs to avoid duplicates
		const existingIds = await getExistingActivityIds(db);

		// Filter to only new runs
		const newRuns = recentRuns.filter(
			(run) => !existingIds.has(run.garmin_activity_id)
		);

		if (newRuns.length === 0) {
			return json({
				success: true,
				newRuns: 0,
				message: 'No new runs found'
			});
		}

		// Sync each new run
		for (const run of newRuns) {
			// Insert the run
			await insertRun(db, {
				...run,
				ai_feedback: null
			});

			// Get AI feedback (non-blocking for cron)
			try {
				const feedback = await analyzeRun(db, run);
				await updateRunFeedback(db, run.garmin_activity_id, feedback);
			} catch (err) {
				console.error('Failed to get AI feedback:', err);
			}
		}

		console.log(`Cron sync: added ${newRuns.length} new runs`);

		return json({
			success: true,
			newRuns: newRuns.length,
			message: `Synced ${newRuns.length} run(s)`
		});
	} catch (err) {
		console.error('Cron sync failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{
				success: false,
				error: message
			},
			{ status: 500 }
		);
	}
};
