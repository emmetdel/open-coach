// Smart training plan intelligence
// Automatically manages workouts, detects patterns, and notifies users

import type { LocalDatabase } from "./sqlite";
import {
  getWorkoutsInRange,
  updatePlanStatus,
  getRecentRuns,
  insertChatMessage,
  type TrainingPlan,
} from "./db";
import { sendPushNotification } from "./notifications";

/**
 * Smart Weekly Analysis
 * Checks if the user has completed their weekly running quota
 * If yes, automatically marks remaining pending runs as completed
 */
export async function analyzeWeeklyProgress(
  db: LocalDatabase,
  userId: string,
): Promise<{
  weekComplete: boolean;
  runsCompleted: number;
  runsRequired: number;
  autoCompleted: number;
}> {
  // Get current week (Monday to Sunday)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Get to Monday

  const monday = new Date(today);
  monday.setDate(monday.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayStr = monday.toISOString().split("T")[0];
  const sundayStr = sunday.toISOString().split("T")[0];

  // Get all workouts this week
  const weekWorkouts = await getWorkoutsInRange(
    db,
    userId,
    mondayStr,
    sundayStr,
  );

  // Count completed vs total
  const completed = weekWorkouts.filter((w) => w.status === "Completed").length;
  const total = weekWorkouts.filter((w) => w.type !== "Rest").length;

  // If all required runs are done, auto-complete the rest
  let autoCompleted = 0;
  if (completed >= total && total > 0) {
    const pending = weekWorkouts.filter(
      (w) => w.status === "Pending" && w.type !== "Rest",
    );

    for (const workout of pending) {
      await updatePlanStatus(db, userId, workout.id, "Completed");
      autoCompleted++;
    }
  }

  return {
    weekComplete: completed >= total,
    runsCompleted: completed,
    runsRequired: total,
    autoCompleted,
  };
}

/**
 * Missed Run Detection
 * Checks for runs that should have happened but didn't
 * Sends notifications and creates chat messages
 */
export async function detectMissedRuns(
  db: LocalDatabase,
  userId: string,
): Promise<{
  missedRuns: TrainingPlan[];
  notificationsSent: number;
}> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Find workouts from yesterday that are still pending
  const yesterdaysWorkouts = await getWorkoutsInRange(
    db,
    userId,
    yesterdayStr,
    yesterdayStr,
  );
  const missedRuns = yesterdaysWorkouts.filter(
    (w) => w.status === "Pending" && w.type !== "Rest",
  );

  let notificationsSent = 0;

  for (const workout of missedRuns) {
    // Mark as Missed
    await updatePlanStatus(db, userId, workout.id, "Missed");

    // Send notification
    try {
      await sendPushNotification(db, userId, {
        title: "Missed your run yesterday? 🤔",
        body: `You had a ${workout.type} run (${workout.target_distance_km}km) scheduled. Everything okay?`,
        tag: `missed-run-${workout.id}`,
        data: { url: "/" },
      });
      notificationsSent++;
    } catch (err) {
      console.warn("Failed to send missed run notification:", err);
    }

    // Create a chat message for the coach to follow up
    await insertChatMessage(db, userId, {
      id: crypto.randomUUID(),
      role: "system",
      content: `User missed their ${workout.type} run on ${workout.scheduled_date}. Follow up with empathy and ask if they need help adjusting the plan.`,
      created_at: new Date().toISOString(),
      context_type: "plan",
      context_id: workout.id,
    });
  }

  return {
    missedRuns,
    notificationsSent,
  };
}

/**
 * Smart Run Matching (Enhanced)
 * When runs are synced, intelligently match them to the plan
 * Considers the week's quota and auto-completes if needed
 */
export async function smartMatchRuns(
  db: LocalDatabase,
  userId: string,
): Promise<{
  matched: number;
  weekCompleted: boolean;
}> {
  // Get recent runs (last 7 days)
  const recentRuns = await getRecentRuns(db, userId, 10);

  // Get current week's workouts
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(monday.getDate() + mondayOffset);
  const mondayStr = monday.toISOString().split("T")[0];

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sundayStr = sunday.toISOString().split("T")[0];

  const weekWorkouts = await getWorkoutsInRange(
    db,
    userId,
    mondayStr,
    sundayStr,
  );
  const pendingWorkouts = weekWorkouts.filter(
    (w) => w.status === "Pending" && w.type !== "Rest",
  );

  let matched = 0;

  // Match runs to pending workouts
  for (const run of recentRuns) {
    const runDate = run.date.split(" ")[0];

    // Find closest pending workout
    let closestWorkout: TrainingPlan | null = null;
    let smallestDiff = Infinity;

    for (const workout of pendingWorkouts) {
      const runTime = new Date(runDate).getTime();
      const workoutTime = new Date(workout.scheduled_date).getTime();
      const diff = Math.abs(runTime - workoutTime);

      // Within 4 days window
      if (diff < 4 * 24 * 60 * 60 * 1000 && diff < smallestDiff) {
        smallestDiff = diff;
        closestWorkout = workout;
      }
    }

    if (closestWorkout) {
      await updatePlanStatus(db, userId, closestWorkout.id, "Completed");
      matched++;
      // Remove from pending list
      const index = pendingWorkouts.findIndex(
        (w) => w.id === closestWorkout!.id,
      );
      if (index > -1) pendingWorkouts.splice(index, 1);
    }
  }

  // Check if week is complete
  const analysis = await analyzeWeeklyProgress(db, userId);

  return {
    matched,
    weekCompleted: analysis.weekComplete,
  };
}

/**
 * Consistency Check
 * Detects if user is falling behind and needs encouragement
 */
export async function checkConsistency(
  db: LocalDatabase,
  userId: string,
): Promise<{
  streak: number;
  lastRunDaysAgo: number;
  needsEncouragement: boolean;
}> {
  const recentRuns = await getRecentRuns(db, userId, 30);

  if (recentRuns.length === 0) {
    return {
      streak: 0,
      lastRunDaysAgo: 999,
      needsEncouragement: true,
    };
  }

  // Calculate streak (consecutive weeks with at least 1 run)
  const weeklyRunCounts = new Map<string, number>();

  for (const run of recentRuns) {
    const runDate = new Date(run.date);
    const weekKey = `${runDate.getFullYear()}-W${getWeekNumber(runDate)}`;
    weeklyRunCounts.set(weekKey, (weeklyRunCounts.get(weekKey) || 0) + 1);
  }

  // Count consecutive weeks from now
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i * 7);
    const weekKey = `${checkDate.getFullYear()}-W${getWeekNumber(checkDate)}`;

    if (weeklyRunCounts.has(weekKey)) {
      streak++;
    } else {
      break;
    }
  }

  // Days since last run
  const lastRun = recentRuns[0];
  const lastRunDate = new Date(lastRun.date);
  const daysSince = Math.floor(
    (Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    streak,
    lastRunDaysAgo: daysSince,
    needsEncouragement: daysSince > 4, // More than 4 days
  };
}

// Helper: Get ISO week number
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
