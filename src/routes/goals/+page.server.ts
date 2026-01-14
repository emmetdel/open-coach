import type { PageServerLoad } from './$types';
import { getActiveGoals } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  const db = locals.db;
  if (!db) {
    return { goals: [] };
  }

  try {
    const goals = await getActiveGoals(db);

    // For each goal, calculate progress
    const goalsWithProgress = await Promise.all(
      goals.map(async (goal) => {
        const progress = await calculateGoalProgress(db, goal.id);
        return { ...goal, progress };
      })
    );

    return { goals: goalsWithProgress };
  } catch (err) {
    console.error('Failed to load goals:', err);
    return { goals: [] };
  }
};

/**
 * Calculate goal progress based on completed workouts
 */
async function calculateGoalProgress(
  db: any,
  goalId: string
): Promise<{
  percentComplete: number;
  weeksCompleted: number;
  totalWeeks: number;
  runsCompleted: number;
  totalRuns: number;
  longestRun: number;
  status: 'on_track' | 'behind' | 'ahead';
}> {
  // Get all workouts for this goal
  const result = await db.prepare(
    `SELECT * FROM training_plan WHERE goal_id = ? ORDER BY scheduled_date`
  ).bind(goalId).all();

  const workouts = result.results || [];

  if (workouts.length === 0) {
    return {
      percentComplete: 0,
      weeksCompleted: 0,
      totalWeeks: 0,
      runsCompleted: 0,
      totalRuns: 0,
      longestRun: 0,
      status: 'on_track'
    };
  }

  const totalWeeks = Math.max(...workouts.map((w: any) => w.week_number));
  const today = new Date().toISOString().split('T')[0];

  // Count completed workouts
  const completedWorkouts = workouts.filter((w: any) => w.status === 'Completed');
  const runsCompleted = completedWorkouts.length;
  const totalRuns = workouts.length;

  // Calculate weeks completed (based on past dates)
  const pastWorkouts = workouts.filter((w: any) => w.scheduled_date <= today);
  const weeksCompleted = pastWorkouts.length > 0
    ? Math.max(...pastWorkouts.map((w: any) => w.week_number))
    : 0;

  // Find longest completed run
  const longestRun = completedWorkouts.length > 0
    ? Math.max(...completedWorkouts.map((w: any) => w.target_distance_km))
    : 0;

  // Calculate progress percentage
  const percentComplete = totalRuns > 0
    ? Math.round((runsCompleted / totalRuns) * 100)
    : 0;

  // Determine status
  let status: 'on_track' | 'behind' | 'ahead' = 'on_track';

  // Expected runs completed by now
  const expectedRuns = pastWorkouts.length;
  if (runsCompleted < expectedRuns - 1) {
    status = 'behind';
  } else if (runsCompleted > expectedRuns) {
    status = 'ahead';
  }

  return {
    percentComplete,
    weeksCompleted,
    totalWeeks,
    runsCompleted,
    totalRuns,
    longestRun,
    status
  };
}
