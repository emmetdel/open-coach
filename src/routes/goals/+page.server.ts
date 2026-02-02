import type { PageServerLoad } from './$types';
import { getActiveGoals, getRunsAfterDate, getPlanMetadata } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  const db = locals.db;
  if (!db) {
    return { goals: [] };
  }
  if (!locals.user) {
    return { goals: [] };
  }
  const userId = locals.user.id;

  try {
    const goals = await getActiveGoals(db, userId);

    // For each goal, calculate progress
    const goalsWithProgress = await Promise.all(
      goals.map(async (goal) => {
        const progress = await calculateGoalProgress(db, userId, goal);
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
 * Calculate goal progress based on actual runs vs target
 */
async function calculateGoalProgress(
  db: any,
  userId: string,
  goal: any // TrainingGoal
): Promise<{
  percentComplete: number;
  weeksCompleted: number;
  totalWeeks: number;
  runsCompleted: number;
  totalRuns: number;
  longestRun: number;
  status: 'on_track' | 'behind' | 'ahead';
}> {
  // 1. Determine Goal Timeline
  const startDate = goal.created_at;
  const targetDate = goal.target_date;
  
  // Calculate total duration in weeks
  const start = new Date(startDate);
  const target = new Date(targetDate);
  const totalWeeks = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  // Calculate weeks completed so far
  const now = new Date();
  const weeksCompleted = Math.max(0, Math.min(totalWeeks, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))));

  // 2. Get Actual Progress (Any run since goal creation)
  const runs = await getRunsAfterDate(db, userId, startDate.split(' ')[0]); // Ensure YYYY-MM-DD format if needed, but typically standard SQL string comparison works
  
  const runsCompleted = runs.length;
  const longestRun = runs.length > 0 
    ? Math.max(...runs.map((r: any) => r.distance_meters / 1000))
    : 0;

  // 3. Get Planned Progress (If plans exist)
  const plansResult = await db
    .prepare(
      `SELECT * FROM training_plan WHERE user_id = ? AND goal_id = ? ORDER BY scheduled_date`,
    )
    .bind(userId, goal.id)
    .all();
  const plannedWorkouts = plansResult.results || [];
  
  // Total runs expected is either the number of planned workouts OR estimation based on runs/week target
  // If we have plans, use them. If not, estimate 3 runs/week
  const totalRuns = plannedWorkouts.length > 0 
    ? plannedWorkouts.length 
    : totalWeeks * 3;

  // 4. Calculate Percentage
  // If we have plans, use completed/total runs. 
  // If no plans, use time elapsed ? No, that's misleading.
  // Better: Use runs completed vs expected total runs
  const percentComplete = totalRuns > 0
    ? Math.min(100, Math.round((runsCompleted / totalRuns) * 100))
    : 0;

  // 5. Determine Status
  let status: 'on_track' | 'behind' | 'ahead' = 'on_track';
  
  // Expected runs by now
  let expectedRunsByType: number;
  
  if (plannedWorkouts.length > 0) {
     const today = new Date().toISOString().split('T')[0];
     // Count planned workouts up to today
     expectedRunsByType = plannedWorkouts.filter((w: any) => w.scheduled_date <= today).length;
  } else {
     // Estimate based on time elapsed (e.g. 3 runs per week)
     expectedRunsByType = weeksCompleted * 3;
  }

  if (runsCompleted < expectedRunsByType - 1) {
    status = 'behind';
  } else if (runsCompleted > expectedRunsByType + 2) {
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
