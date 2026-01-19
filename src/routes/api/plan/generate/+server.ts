import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { generateFullPlan } from "$lib/server/coach";
import {
  hasCompletedSetup,
  deleteAllPlans,
  deleteFuturePlans,
  getActiveGoals,
  getGoalById,
  getSetting,
  getRecentRuns,
  setPlanMetadata,
  insertPlan,
  type Database,
  SETTING_KEYS,
} from "$lib/server/db";
import { deleteAllOpenCoachWorkouts } from "$lib/server/garmin";
import { generateGoalBasedPlan } from "$lib/server/goalBasedPlanner";

// POST: Generate a fresh plan (deletes existing and creates new)
export const POST: RequestHandler = async ({ locals, request }) => {
  const db = locals.db;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Check if setup is complete
  const isSetup = await hasCompletedSetup(db);
  if (!isSetup) {
    return json({
      success: false,
      weeksGenerated: 0,
      message: "Please complete setup first (Garmin credentials and goals)",
    });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      goalId?: string;
      plan_generation_strategy?: "auto" | "goal_based" | "legacy";
    };

    const configuredStrategy = (await getSetting(
      db,
      SETTING_KEYS.PLAN_GENERATION_STRATEGY,
    )) as "auto" | "goal_based" | "legacy" | null;
    const strategy =
      body.plan_generation_strategy || configuredStrategy || "auto";

    // Get active goals
    const goals = await getActiveGoals(db);

    if (strategy === "legacy") {
      return await generateLegacyPlan(db);
    }

    if (strategy === "goal_based" && goals.length === 0) {
      return json({
        success: false,
        weeksGenerated: 0,
        message:
          "Goal-based plan requested but no goals exist. Create a goal first or switch to legacy.",
      });
    }

    // Auto strategy falls back to legacy if no goals
    if (strategy === "auto" && goals.length === 0) {
      return await generateLegacyPlan(db);
    }

    // Use goal-based generation
    const primaryGoal = body.goalId
      ? await getGoalById(db, body.goalId)
      : goals[0];

    if (!primaryGoal) {
      return json({
        success: false,
        weeksGenerated: 0,
        message: "No valid goal found",
      });
    }

    // First, clean up existing Garmin workouts
    try {
      await deleteAllOpenCoachWorkouts(db);
    } catch (garminErr) {
      console.warn("Could not delete existing Garmin workouts:", garminErr);
      // Continue anyway
    }

    // Delete ONLY future pending workouts (preserve history)
    await deleteFuturePlans(db);

    // Generate goal-based plan
    const currentFitness = await getSetting(db, SETTING_KEYS.CURRENT_FITNESS);
    const availableDaysJson = await getSetting(
      db,
      SETTING_KEYS.AVAILABLE_DAYS,
    );

    const plan = await generateGoalBasedPlan(db, {
      goalId: primaryGoal.id,
      goalDate: primaryGoal.target_date,
      goalDistance: primaryGoal.target_distance_km || 10,
      currentFitness: currentFitness || "",
      availableDays: availableDaysJson
        ? JSON.parse(availableDaysJson)
        : ["Mon", "Wed", "Fri", "Sun"],
      recentRuns: await getRecentRuns(db, 28), // Last 4 weeks
    });

    // Insert new workouts
    for (const week of plan.weeks) {
      for (const workout of week.workouts) {
        await insertPlan(db, {
          id: workout.id,
          scheduled_date: workout.scheduled_date,
          week_number: week.weekNumber,
          type: workout.type as any,
          target_distance_km: workout.target_distance_km,
          target_duration_minutes: workout.target_duration_minutes,
          description: workout.description,
          status: "Pending",
          goal_id: workout.goal_id,
          google_event_id: workout.google_event_id,
          garmin_workout_id: workout.garmin_workout_id,
        });
      }
    }

    // Update metadata
    await setPlanMetadata(db, "primary_goal_id", primaryGoal.id);
    await setPlanMetadata(db, "generation_strategy", "goal_based");
    await setPlanMetadata(db, "total_weeks", String(plan.totalWeeks));

    return json({
      success: true,
      weeksGenerated: plan.totalWeeks,
      goalName: primaryGoal.name,
      message: `Generated ${plan.totalWeeks} weeks of training for ${primaryGoal.name}`,
    });
  } catch (err) {
    console.error("Plan generation failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({
      success: false,
      weeksGenerated: 0,
      error: message,
    });
  }
};

/**
 * Legacy plan generation for users without goals
 */
async function generateLegacyPlan(db: Database) {
  try {
    // First, clean up existing Garmin workouts
    try {
      await deleteAllOpenCoachWorkouts(db);
    } catch (garminErr) {
      console.warn("Could not delete existing Garmin workouts:", garminErr);
      // Continue anyway
    }

    // Delete existing plans
    await deleteAllPlans(db);

    // Generate new full plan
    const result = await generateFullPlan(db);

    return json({
      success: result.success,
      weeksGenerated: result.totalWeeks || 0,
      message: result.success
        ? `Generated ${result.totalWeeks} weeks of training`
        : result.message || "Failed to generate plan",
    });
  } catch (err) {
    console.error("Legacy plan generation failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({
      success: false,
      weeksGenerated: 0,
      error: message,
    });
  }
}
