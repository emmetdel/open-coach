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
	hasCompletedSetup,
	listUsers
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
	try {
		const users = await listUsers(db);
		let totalNewRuns = 0;

		for (const user of users) {
			const isSetup = await hasCompletedSetup(db, user.id);
			if (!isSetup) {
				continue;
			}

			const recentRuns = await fetchRecentRuns(db, user.id, 5);
			const existingIds = await getExistingActivityIds(db, user.id);
			const newRuns = recentRuns.filter(
				(run) => !existingIds.has(run.garmin_activity_id)
			);

			for (const run of newRuns) {
				await insertRun(db, user.id, {
					...run,
					ai_feedback: null
				});

				try {
					const feedback = await analyzeRun(db, user.id, run);
					await updateRunFeedback(db, user.id, run.garmin_activity_id, feedback);
				} catch (err) {
					console.error('Failed to get AI feedback:', err);
				}
			}

			totalNewRuns += newRuns.length;
		}

		return json({
			success: true,
			newRuns: totalNewRuns,
			message: totalNewRuns > 0 ? `Synced ${totalNewRuns} run(s)` : 'No new runs found'
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
