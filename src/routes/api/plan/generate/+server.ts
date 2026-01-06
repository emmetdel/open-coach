import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateFullPlan } from '$lib/server/coach';
import { hasCompletedSetup, deleteAllPlans } from '$lib/server/db';
import { deleteAllOpenCoachWorkouts } from '$lib/server/garmin';

// POST: Generate a fresh plan (deletes existing and creates new)
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
			weeksGenerated: 0,
			message: 'Please complete setup first (Garmin credentials and goals)'
		});
	}

	try {
		// First, clean up existing Garmin workouts
		try {
			await deleteAllOpenCoachWorkouts(db);
		} catch (garminErr) {
			console.warn('Could not delete existing Garmin workouts:', garminErr);
			// Continue anyway
		}

		// Delete existing plans
		await deleteAllPlans(db);

		// Generate new full plan
		const result = await generateFullPlan(db);
		
		return json({
			success: result.success,
			weeksGenerated: result.weeksGenerated || 0,
			message: result.success 
				? `Generated ${result.weeksGenerated} weeks of training` 
				: result.message || 'Failed to generate plan'
		});
	} catch (err) {
		console.error('Plan generation failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({
			success: false,
			weeksGenerated: 0,
			error: message
		});
	}
};

