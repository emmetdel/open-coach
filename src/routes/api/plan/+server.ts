import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateWeeklyPlan } from '$lib/server/coach';
import { getUpcomingPlans, getNextRun, hasCompletedSetup, deleteAllPlans } from '$lib/server/db';
import { deleteAllOpenCoachWorkouts } from '$lib/server/garmin';

// GET: Get upcoming planned runs
export const GET: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	const [upcomingPlans, nextRun] = await Promise.all([
		getUpcomingPlans(db, userId, 7),
		getNextRun(db, userId)
	]);

	return json({
		plans: upcomingPlans,
		nextRun
	});
};

// POST: Generate a new weekly plan
export const POST: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db, userId);
	if (!isSetup) {
		return json({
			success: false,
			runsCreated: 0,
			message: 'Please complete setup first (Garmin credentials and goals)'
		});
	}

	try {
		const result = await generateWeeklyPlan(db, userId);
		return json(result);
	} catch (err) {
		console.error('Plan generation failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, `Plan generation failed: ${message}`);
	}
};

// DELETE: Clear all plans
export const DELETE: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	try {
		// First, try to delete workouts from Garmin
		try {
			await deleteAllOpenCoachWorkouts(db, userId);
		} catch (garminErr) {
			console.warn('Could not delete Garmin workouts:', garminErr);
			// Continue anyway - local deletion is more important
		}

		// Delete all local plans
		await deleteAllPlans(db, userId);

		return json({
			success: true,
			message: 'Training plan cleared'
		});
	} catch (err) {
		console.error('Plan deletion failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, `Plan deletion failed: ${message}`);
	}
};
