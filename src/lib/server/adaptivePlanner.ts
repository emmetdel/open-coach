import type { Database, TrainingPlan } from "./db";

export interface WeeklyAnalysis {
  weekNumber: number;
  planned: {
    runs: number;
    volume: number;
  };
  actual: {
    runs: number;
    volume: number;
  };
  variance: {
    runs: number; // -1 if missed a run
    volume: number; // -5km if 5km short
  };
  recommendation:
    | "on_track"
    | "add_makeup"
    | "reduce_volume"
    | "extend_timeline";
}

/**
 * Analyze weekly progress vs planned workouts
 */
export async function analyzeWeeklyProgress(
  db: Database,
  goalId: string,
): Promise<WeeklyAnalysis> {
  // Get current week number
  const currentWeek = await getCurrentWeekNumber(db, goalId);

  // Get planned workouts for this week
  const plannedWorkouts = await getWorkoutsForWeek(db, currentWeek, goalId);

  // Get actual runs from this week
  const actualRuns = await getActualRunsForWeek(db, currentWeek, goalId);

  const plannedRuns = plannedWorkouts.length;
  const actualRunsCount = actualRuns.length;

  const plannedVolume = plannedWorkouts.reduce(
    (sum, w) => sum + (w.target_distance_km || 0),
    0,
  );
  const actualVolume = actualRuns.reduce(
    (sum, r) => sum + r.distance_meters / 1000,
    0,
  );

  const variance = {
    runs: actualRunsCount - plannedRuns,
    volume: actualVolume - plannedVolume,
  };

  // Determine recommendation
  let recommendation: WeeklyAnalysis["recommendation"] = "on_track";

  if (variance.runs < -1) {
    recommendation = "add_makeup";
  } else if (variance.volume > 5 && (await isConsistentlyAhead(db, goalId))) {
    recommendation = "reduce_volume";
  } else if (variance.runs < -2 && variance.volume < -10) {
    recommendation = "extend_timeline";
  }

  return {
    weekNumber: currentWeek,
    planned: {
      runs: plannedRuns,
      volume: plannedVolume,
    },
    actual: {
      runs: actualRunsCount,
      volume: actualVolume,
    },
    variance,
    recommendation,
  };
}

/**
 * Adjust next week's plan based on analysis
 */
export async function adjustNextWeek(
  db: Database,
  goalId: string,
  analysis: WeeklyAnalysis,
): Promise<void> {
  switch (analysis.recommendation) {
    case "add_makeup":
      await addMakeupRun(db, goalId, analysis.weekNumber + 1);
      break;
    case "reduce_volume":
      await reduceNextWeekVolume(db, goalId, analysis.weekNumber + 1, 0.9);
      break;
    case "extend_timeline":
      await extendGoalTimeline(db, goalId, 1);
      break;
    case "on_track":
      // No adjustment needed
      break;
  }
}

/**
 * Add a makeup run to next week
 */
export async function addMakeupRun(
  db: Database,
  goalId: string,
  weekNumber: number,
): Promise<void> {
  // Find an available day next week that doesn't have a workout
  const nextWeekWorkouts = await getWorkoutsForWeek(db, weekNumber, goalId);
  const usedDays = nextWeekWorkouts.map((w) => getDayOfWeek(w.scheduled_date));

  // Get available days from settings
  const availableDays = await getAvailableDays(db);
  const openDay = availableDays.find((day) => !usedDays.includes(day));

  if (!openDay) {
    console.warn("No open days for makeup run, skipping");
    return;
  }

  // Add an easy recovery run
  const nextWeekStart = getWeekStartDate(weekNumber);
  const makeupDate = getDateForDay(nextWeekStart, openDay);

  await insertPlan(db, {
    id: crypto.randomUUID(),
    scheduled_date: makeupDate,
    week_number: weekNumber,
    type: "Easy",
    target_distance_km: 3, // Short 3km recovery run
    target_duration_minutes: 18, // ~6 min/km
    description: "🔄 Makeup Run: Easy 3km recovery",
    status: "Pending",
    goal_id: goalId,
    google_event_id: null,
    garmin_workout_id: null,
  });
}

/**
 * Reduce next week's volume by a percentage
 */
async function reduceNextWeekVolume(
  db: Database,
  goalId: string,
  weekNumber: number,
  reductionFactor: number,
): Promise<void> {
  const workouts = await getWorkoutsForWeek(db, weekNumber, goalId);

  for (const workout of workouts) {
    const newDistance = (workout.target_distance_km || 0) * reductionFactor;
    const newDuration =
      (workout.target_duration_minutes || 0) * reductionFactor;

    await db
      .prepare(
        `UPDATE training_plan
       SET target_distance_km = ?, target_duration_minutes = ?,
           description = description || ' (Reduced by 10%)'
       WHERE id = ?`,
      )
      .bind(newDistance, newDuration, workout.id)
      .run();
  }
}

/**
 * Extend goal timeline by weeks
 */
async function extendGoalTimeline(
  db: Database,
  goalId: string,
  additionalWeeks: number,
): Promise<void> {
  const goal = await db
    .prepare("SELECT target_date FROM training_goals WHERE id = ?")
    .bind(goalId)
    .first<{ target_date: string }>();

  if (!goal) return;

  const newDate = new Date(goal.target_date);
  newDate.setDate(newDate.getDate() + additionalWeeks * 7);

  await db
    .prepare("UPDATE training_goals SET target_date = ? WHERE id = ?")
    .bind(newDate.toISOString().split("T")[0], goalId)
    .run();
}

/**
 * Check if user is consistently ahead of plan
 */
async function isConsistentlyAhead(
  db: Database,
  goalId: string,
): Promise<boolean> {
  // Check last 3 weeks
  const currentWeek = await getCurrentWeekNumber(db, goalId);

  for (let week = Math.max(1, currentWeek - 2); week < currentWeek; week++) {
    const planned = await getWorkoutsForWeek(db, week, goalId);
    const actual = await getActualRunsForWeek(db, week, goalId);

    const plannedVolume = planned.reduce(
      (sum, w) => sum + (w.target_distance_km || 0),
      0,
    );
    const actualVolume = actual.reduce(
      (sum, r) => sum + r.distance_meters / 1000,
      0,
    );

    if (actualVolume <= plannedVolume * 1.05) {
      return false; // Not consistently ahead
    }
  }

  return true;
}

// Helper functions

async function getCurrentWeekNumber(
  db: Database,
  goalId: string,
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT MIN(week_number) as min_week FROM training_plan
     WHERE goal_id = ? AND status = 'Pending'`,
    )
    .bind(goalId)
    .first<{ min_week: number }>();

  return result?.min_week || 1;
}

async function getWorkoutsForWeek(
  db: Database,
  weekNumber: number,
  goalId: string,
): Promise<TrainingPlan[]> {
  const result = await db
    .prepare(
      `SELECT * FROM training_plan
     WHERE week_number = ? AND goal_id = ?
     ORDER BY scheduled_date`,
    )
    .bind(weekNumber, goalId)
    .all<TrainingPlan>();
  return result.results || [];
}

async function getActualRunsForWeek(
  db: Database,
  weekNumber: number,
  goalId: string,
): Promise<any[]> {
  const workouts = await getWorkoutsForWeek(db, weekNumber, goalId);
  if (workouts.length === 0) return [];

  const startDate = workouts[0].scheduled_date;
  const endDate = workouts[workouts.length - 1].scheduled_date;

  const result = await db
    .prepare(
      `SELECT * FROM runs
     WHERE date >= ? AND date <= ?
     ORDER BY date`,
    )
    .bind(startDate, endDate)
    .all();
  return result.results || [];
}

async function getAvailableDays(db: Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT value FROM user_settings WHERE key = 'AVAILABLE_DAYS'")
    .first<{ value: string }>();

  return result ? JSON.parse(result.value) : ["Mon", "Wed", "Fri", "Sun"];
}

function getDayOfWeek(dateString: string): string {
  const date = new Date(dateString);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

function getWeekStartDate(weekNumber: number): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const nextMonday = new Date(today);
  nextMonday.setDate(
    nextMonday.getDate() + daysUntilMonday + (weekNumber - 1) * 7,
  );
  return nextMonday;
}

function getDateForDay(weekStart: Date, dayName: string): string {
  const dayOffsets: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  const targetDate = new Date(weekStart);
  targetDate.setDate(targetDate.getDate() + dayOffsets[dayName]);
  return targetDate.toISOString().split("T")[0];
}

async function insertPlan(db: Database, plan: any): Promise<void> {
  await db
    .prepare(
      `INSERT INTO training_plan
     (id, scheduled_date, week_number, type, target_distance_km,
      target_duration_minutes, description, status, goal_id,
      google_event_id, garmin_workout_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      plan.id,
      plan.scheduled_date,
      plan.week_number,
      plan.type,
      plan.target_distance_km,
      plan.target_duration_minutes,
      plan.description,
      plan.status,
      plan.goal_id,
      plan.google_event_id,
      plan.garmin_workout_id,
    )
    .run();
}
