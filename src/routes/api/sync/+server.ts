import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRecentRuns, type NormalizedRun } from '$lib/server/garmin';
import { analyzeRun } from '$lib/server/coach';
import {
	getExistingActivityIds,
	insertRun,
	updateRunFeedback,
	getRunByActivityId,
	hasCompletedSetup
} from '$lib/server/db';
import type { LocalDatabase } from '$lib/server/sqlite';
import { notifyRunSynced } from '$lib/server/notifications';

export interface SyncResult {
	success: boolean;
	newRuns: number;
	message: string;
	authRequired?: boolean; // True if re-authentication is needed
}

// Sync a single run: insert to DB, get AI feedback, and notify
async function syncRun(
	db: LocalDatabase,
	run: NormalizedRun
): Promise<void> {
	// Insert the run first (without AI feedback)
	await insertRun(db, {
		...run,
		ai_feedback: null
	});

	// Get AI feedback
	let feedback: string | null = null;
	try {
		feedback = await analyzeRun(db, run);
		await updateRunFeedback(db, run.garmin_activity_id, feedback);
	} catch (err) {
		console.error('Failed to get AI feedback for run:', run.garmin_activity_id, err);
	}

	// Send notification
	try {
		const savedRun = await getRunByActivityId(db, run.garmin_activity_id);
		if (savedRun) {
			await notifyRunSynced(db, savedRun);
		}
	} catch (err) {
		console.error('Failed to send notification:', err);
	}
}

export const POST: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db);
	if (!isSetup) {
		return json({
			success: false,
			newRuns: 0,
			message: 'Please complete setup first'
		} satisfies SyncResult);
	}

	try {
		// Fetch recent runs from Garmin
		const recentRuns = await fetchRecentRuns(db, 10);

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
				message: 'No new runs to sync'
			} satisfies SyncResult);
		}

		// Sync each new run
		for (const run of newRuns) {
			await syncRun(db, run);
		}

		return json({
			success: true,
			newRuns: newRuns.length,
			message: `Synced ${newRuns.length} new run${newRuns.length > 1 ? 's' : ''}`
		} satisfies SyncResult);
	} catch (err) {
		console.error('Sync failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';

		// Check if this is an authentication error
		const isAuthError =
			message.includes('expired') ||
			message.includes('401') ||
			message.includes('not connected') ||
			message.includes('auth script');

		if (isAuthError) {
			return json({
				success: false,
				newRuns: 0,
				message: 'Garmin session expired. Please re-authenticate.',
				authRequired: true
			} satisfies SyncResult);
		}

		throw error(500, `Sync failed: ${message}`);
	}
};

// GET endpoint to check sync status
export const GET: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const isSetup = await hasCompletedSetup(db);

	return json({
		ready: isSetup,
		message: isSetup ? 'Ready to sync' : 'Setup required'
	});
};
