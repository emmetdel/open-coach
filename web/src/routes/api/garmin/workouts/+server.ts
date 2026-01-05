import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteAllOpenCoachWorkouts } from '$lib/server/garmin';

// DELETE: Remove all OpenCoach workouts from Garmin
export const DELETE: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const result = await deleteAllOpenCoachWorkouts(db);

		return json({
			success: true,
			message: `Deleted ${result.deleted} workouts from Garmin (${result.errors} errors)`,
			...result
		});
	} catch (e) {
		console.error('Delete workouts error:', e);
		throw error(500, e instanceof Error ? e.message : 'Failed to delete workouts');
	}
};
