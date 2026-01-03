import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pushWeekToGarmin, hasValidTokens } from '$lib/server/garmin';

// POST: Push upcoming workouts to Garmin watch
export const POST: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Check if Garmin is connected
	const hasTokens = await hasValidTokens(db);
	if (!hasTokens) {
		return json({
			success: false,
			message: 'Garmin not connected. Please import tokens first.'
		});
	}

	try {
		const result = await pushWeekToGarmin(db);

		if (result.success) {
			return json({
				success: true,
				pushed: result.pushed,
				message: result.pushed > 0
					? `Sent ${result.pushed} workout${result.pushed > 1 ? 's' : ''} to your Garmin watch!`
					: 'All workouts already synced to watch.'
			});
		} else {
			return json({
				success: false,
				pushed: result.pushed,
				errors: result.errors,
				message: `Synced ${result.pushed} workouts. ${result.errors.length} failed.`
			});
		}
	} catch (err) {
		console.error('Watch sync failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, `Watch sync failed: ${message}`);
	}
};

// GET: Check sync status
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const hasTokens = await hasValidTokens(db);

	return json({
		connected: hasTokens,
		message: hasTokens ? 'Ready to sync' : 'Garmin not connected'
	});
};

