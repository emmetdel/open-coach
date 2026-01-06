import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateWeeklyPlan } from '$lib/server/coach';
import { getUpcomingPlans, getNextRun, hasCompletedSetup } from '$lib/server/db';

// GET: Get upcoming planned runs
export const GET: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const [upcomingPlans, nextRun] = await Promise.all([
		getUpcomingPlans(db, 7),
		getNextRun(db)
	]);

	return json({
		plans: upcomingPlans,
		nextRun
	});
};

// POST: Generate a new weekly plan
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
			runsCreated: 0,
			message: 'Please complete setup first (Garmin credentials and goals)'
		});
	}

	try {
		const result = await generateWeeklyPlan(db);
		return json(result);
	} catch (err) {
		console.error('Plan generation failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		throw error(500, `Plan generation failed: ${message}`);
	}
};
