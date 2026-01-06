import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database } from 'better-sqlite3';

interface RescheduleRequest {
	planId: string;
	action: 'move_tomorrow' | 'swap_next' | 'convert_walk' | 'skip';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const db = locals.db as Database;
	if (!db) {
		return json({ success: false, error: 'Database not available' }, { status: 500 });
	}

	try {
		const body: RescheduleRequest = await request.json();
		const { planId, action } = body;

		if (!planId || !action) {
			return json({ success: false, error: 'Missing planId or action' }, { status: 400 });
		}

		// Get the current plan
		const plan = db
			.prepare('SELECT * FROM training_plan WHERE id = ?')
			.get(planId) as { id: string; scheduled_date: string; type: string; target_distance_km: number; target_duration_minutes: number; description: string; garmin_workout_id: string | null } | undefined;

		if (!plan) {
			return json({ success: false, error: 'Plan not found' }, { status: 404 });
		}

		const today = new Date().toISOString().split('T')[0];

		switch (action) {
			case 'move_tomorrow': {
				// Move today's run to tomorrow
				const tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				const tomorrowStr = tomorrow.toISOString().split('T')[0];

				// Check if there's already a run tomorrow
				const tomorrowPlan = db
					.prepare('SELECT id FROM training_plan WHERE scheduled_date = ? AND status = ?')
					.get(tomorrowStr, 'Pending') as { id: string } | undefined;

				if (tomorrowPlan) {
					// Swap: move tomorrow's run to today
					db.prepare('UPDATE training_plan SET scheduled_date = ? WHERE id = ?').run(today, tomorrowPlan.id);
				}

				// Move today's run to tomorrow
				db.prepare('UPDATE training_plan SET scheduled_date = ? WHERE id = ?').run(tomorrowStr, planId);

				// Update Garmin if needed (delete and recreate)
				if (plan.garmin_workout_id) {
					const { deleteGarminWorkout, pushWorkoutToGarmin } = await import('$lib/server/garmin');
					await deleteGarminWorkout(db, plan.garmin_workout_id);
					db.prepare('UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?').run(planId);
					
					// Re-sync workouts for the next 7 days
					const { syncWorkoutsToGarmin } = await import('$lib/server/garmin');
					await syncWorkoutsToGarmin(db);
				}

				return json({
					success: true,
					message: tomorrowPlan
						? `Swapped workouts: today's run moved to tomorrow, tomorrow's run moved to today.`
						: `Moved today's run to tomorrow.`
				});
			}

			case 'swap_next': {
				// Find the next scheduled run after today
				const nextPlan = db
					.prepare(`
						SELECT id, scheduled_date FROM training_plan 
						WHERE scheduled_date > ? AND status = ? 
						ORDER BY scheduled_date ASC LIMIT 1
					`)
					.get(today, 'Pending') as { id: string; scheduled_date: string } | undefined;

				if (!nextPlan) {
					return json({ success: false, error: 'No upcoming run to swap with' }, { status: 400 });
				}

				// Swap the dates
				db.prepare('UPDATE training_plan SET scheduled_date = ? WHERE id = ?').run(nextPlan.scheduled_date, planId);
				db.prepare('UPDATE training_plan SET scheduled_date = ? WHERE id = ?').run(today, nextPlan.id);

				// Re-sync Garmin workouts
				if (plan.garmin_workout_id) {
					const { syncWorkoutsToGarmin } = await import('$lib/server/garmin');
					await syncWorkoutsToGarmin(db);
				}

				const swapDate = new Date(nextPlan.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
					weekday: 'long'
				});

				return json({
					success: true,
					message: `Swapped today's run with ${swapDate}'s run.`
				});
			}

			case 'convert_walk': {
				// Convert today's run to an easy 20-minute walk
				db.prepare(`
					UPDATE training_plan 
					SET type = 'Walk', 
					    target_distance_km = NULL, 
					    target_duration_minutes = 20,
					    description = 'Recovery walk - take it easy and enjoy being outside'
					WHERE id = ?
				`).run(planId);

				// Delete the Garmin workout if exists (walks don't need structured workouts)
				if (plan.garmin_workout_id) {
					const { deleteGarminWorkout } = await import('$lib/server/garmin');
					await deleteGarminWorkout(db, plan.garmin_workout_id);
					db.prepare('UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?').run(planId);
				}

				return json({
					success: true,
					message: `Converted today's run to a 20-minute recovery walk. Movement without stress!`
				});
			}

			case 'skip': {
				// Mark as skipped with a note
				db.prepare(`
					UPDATE training_plan 
					SET status = 'Skipped',
					    description = description || ' [Skipped for recovery]'
					WHERE id = ?
				`).run(planId);

				// Delete the Garmin workout
				if (plan.garmin_workout_id) {
					const { deleteGarminWorkout } = await import('$lib/server/garmin');
					await deleteGarminWorkout(db, plan.garmin_workout_id);
					db.prepare('UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?').run(planId);
				}

				return json({
					success: true,
					message: `Today's run skipped. Rest is training too! 💪`
				});
			}

			default:
				return json({ success: false, error: 'Invalid action' }, { status: 400 });
		}
	} catch (err) {
		console.error('Reschedule error:', err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : 'Failed to reschedule' },
			{ status: 500 }
		);
	}
};

