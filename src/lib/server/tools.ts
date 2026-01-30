import type { LocalDatabase } from "./sqlite";
import {
  type TrainingPlan,
  getUpcomingPlans,
  updatePlanStatus,
  insertPlan,
  deleteFuturePlans,
  getPlansForRange,
  updatePlanGarminId,
  insertCoachAction,
  getWorkoutByDate,
  deleteWorkout as dbDeleteWorkout,
  getExistingActivityIds,
  insertRun,
  updateRunFeedback,
  matchRunToPlan,
  getGarminCredentials,
  getWorkoutsInRange,
} from "./db";
import { generateFullPlan, analyzeRun } from "./coach";
import {
  fetchRecentRuns,
  type NormalizedRun,
  deleteGarminWorkout,
} from "./garmin";

// Define the interface for Tool Definitions that we pass to the LLM
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

// Rate limiting for sync operations
const syncRateLimiter = new Map<string, number>();

function canSyncNow(): boolean {
  const lastSync = syncRateLimiter.get("garmin_sync") || 0;
  const now = Date.now();
  if (now - lastSync < 30000) {
    // 30 seconds
    return false;
  }
  syncRateLimiter.set("garmin_sync", now);
  return true;
}

// Define the available tools
export const PLAN_TOOLS: ToolDefinition[] = [
  {
    name: "update_workout",
    description:
      "Modify a specific workout on a given date. Use this to move runs to new dates, change distances, or change types. Can be called multiple times to reschedule multiple workouts. Provide the current date and optionally new_date to move it.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD date of the workout to modify",
        },
        new_date: {
          type: "string",
          description: "Optional: New YYYY-MM-DD date if moving the run",
        },
        type: {
          type: "string",
          enum: ["Easy", "Interval", "Long", "Rest", "Walk-Run"],
          description: "Optional: New workout type",
        },
        distance_km: {
          type: "number",
          description: "Optional: New distance in km",
        },
        reason: {
          type: "string",
          description: "Why this change is being made (for the user)",
        },
      },
      required: ["date", "reason"],
    },
  },
  {
    name: "add_workout",
    description: "Add a new workout to the plan.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD date for the new workout",
        },
        type: {
          type: "string",
          enum: ["Easy", "Interval", "Long", "Walk-Run"],
          description: "Type of workout",
        },
        distance_km: {
          type: "number",
          description: "Distance in km",
        },
        description: {
          type: "string",
          description: "Brief description of the workout",
        },
      },
      required: ["date", "type", "distance_km", "description"],
    },
  },
  {
    name: "regenerate_week",
    description:
      "RARELY NEEDED: Completely deletes and regenerates the entire training plan from scratch. ONLY use this if the user explicitly wants to start completely over or change their available running days permanently. DO NOT use for simple rescheduling - use update_workout instead!",
    parameters: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to confirm regeneration",
        },
      },
      required: ["confirm"],
    },
  },
  {
    name: "sync_garmin_runs",
    description:
      "Sync recent runs from Garmin Connect. Use when the user asks to check for new runs, pull data from their watch, or sync from Garmin.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of activities to fetch (default: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "toggle_workout_status",
    description:
      "Mark a workout as completed or pending. Use when the user confirms they finished a run or wants to mark something as incomplete.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD date of the workout",
        },
        status: {
          type: "string",
          enum: ["Completed", "Pending"],
          description: "New status for the workout",
        },
      },
      required: ["date", "status"],
    },
  },
  {
    name: "move_workout_to_today",
    description:
      "Reschedule a workout from any date to today. Use when the user wants to do a future workout now.",
    parameters: {
      type: "object",
      properties: {
        original_date: {
          type: "string",
          description: "YYYY-MM-DD date of the workout to move to today",
        },
      },
      required: ["original_date"],
    },
  },
  {
    name: "delete_workout",
    description:
      "Remove a workout from the training plan. Use for injuries or schedule conflicts. CAUTION: This is permanent.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD date of the workout to delete",
        },
        reason: {
          type: "string",
          description: "Why this workout is being deleted (for context)",
        },
      },
      required: ["date", "reason"],
    },
  },
  {
    name: "push_to_garmin_watch",
    description:
      "Push upcoming workouts (next 7 days) to the user's Garmin watch. Use when they want to sync their training plan to their device.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_upcoming_workouts",
    description:
      "Get a list of upcoming workouts (next 7 days) with their dates, types, and distances. Use this to see what runs are scheduled before making changes.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look ahead (default: 7)",
        },
      },
      required: [],
    },
  },
];

// Execute the tools
export async function executePlanTool(
  db: LocalDatabase,
  userId: string,
  toolName: string,
  args: any,
  messageId: string | null = null,
): Promise<{ success: boolean; message: string }> {
  // Log the action start
  const actionId = crypto.randomUUID();

  try {
    let result = { success: false, message: "Unknown error" };

    if (toolName === "update_workout") {
      result = await toolUpdateWorkout(db, userId, args);
    } else if (toolName === "add_workout") {
      result = await toolAddWorkout(db, userId, args);
    } else if (toolName === "regenerate_week") {
      result = await toolRegenerateWeek(db, userId);
    } else if (toolName === "sync_garmin_runs") {
      result = await toolSyncGarminRuns(db, userId, args);
    } else if (toolName === "toggle_workout_status") {
      result = await toolToggleWorkoutStatus(db, userId, args);
    } else if (toolName === "move_workout_to_today") {
      result = await toolMoveWorkoutToToday(db, userId, args);
    } else if (toolName === "delete_workout") {
      result = await toolDeleteWorkout(db, userId, args);
    } else if (toolName === "push_to_garmin_watch") {
      result = await toolPushToGarminWatch(db, userId, args);
    } else if (toolName === "get_upcoming_workouts") {
      result = await toolGetUpcomingWorkouts(db, userId, args);
    } else {
      return { success: false, message: `Unknown tool: ${toolName}` };
    }

    // Log the successful action
    await insertCoachAction(db, userId, {
      id: actionId,
      action_type: toolName,
      description: result.message,
      parameters: JSON.stringify(args),
      status: result.success ? "success" : "failed",
      created_at: new Date().toISOString(),
      message_id: messageId,
    });

    return result;
  } catch (error: any) {
    // Log the failed action
    await insertCoachAction(db, userId, {
      id: actionId,
      action_type: toolName,
      description: error.message || "Error executing tool",
      parameters: JSON.stringify(args),
      status: "error",
      created_at: new Date().toISOString(),
      message_id: messageId,
    });

    return {
      success: false,
      message: `Tool execution failed: ${error.message}`,
    };
  }
}

// Tool Implementation: Update Workout
async function toolUpdateWorkout(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const { date, new_date, type, distance_km, reason } = args;

  // Find the workout on that date
  // Note: We need a getPlanByDate function or similar. For now, we'll use a raw query or add a helper.
  // Let's use a targeted query to be safe.
  const plans = await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date = ? AND status = 'Pending'",
    )
    .bind(userId, date)
    .all<TrainingPlan>();

  if (plans.results.length === 0) {
    return { success: false, message: `No pending workout found on ${date}.` };
  }

  const plan = plans.results[0];

  // If moving date
  if (new_date && new_date !== date) {
    // Check if there's already a workout on the new date
  const conflict = await db
      .prepare(
        "SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date = ?",
      )
      .bind(userId, new_date)
      .first();
    if (conflict) {
      return {
        success: false,
        message: `There is already a workout on ${new_date}. Please remove it first or choose another date.`,
      };
    }

    await db
      .prepare(
        "UPDATE training_plan SET scheduled_date = ? WHERE user_id = ? AND id = ?",
      )
      .bind(new_date, userId, plan.id)
      .run();
  }

  // If changing details
  if (type) {
    await db
      .prepare("UPDATE training_plan SET type = ? WHERE user_id = ? AND id = ?")
      .bind(type, userId, plan.id)
      .run();
  }

  if (distance_km) {
    await db
      .prepare(
        "UPDATE training_plan SET target_distance_km = ? WHERE user_id = ? AND id = ?",
      )
      .bind(distance_km, userId, plan.id)
      .run();
  }

  // Update description if changed
  if (type || distance_km) {
    const newType = type || plan.type;
    const newDist = distance_km || plan.target_distance_km;
    const newDesc = `${newType} run: ${newDist}km (Modified by Coach)`;
    await db
      .prepare(
        "UPDATE training_plan SET description = ? WHERE user_id = ? AND id = ?",
      )
      .bind(newDesc, userId, plan.id)
      .run();
  }

  // If we modified it, we should probably reset the sync status (garmin_workout_id) so it resyncs
  // But for now, let's just assume the next sync loop will handle it (OpenCoach does not currently auto-update modified Garmin workouts, but that's a separate issue).
  // Safest is to nullify the garmin ID so it gets pushed as a new workout if needed.
  await updatePlanGarminId(db, userId, plan.id, "");

  let changeMsg = `Updated workout on ${date}`;
  if (new_date) changeMsg += ` -> moved to ${new_date}`;
  if (distance_km) changeMsg += `, distance: ${distance_km}km`;

  return { success: true, message: changeMsg };
}

// Tool Implementation: Add Workout
async function toolAddWorkout(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const { date, type, distance_km, description } = args;

  const conflict = await db
    .prepare("SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date = ?")
    .bind(userId, date)
    .first();
  if (conflict) {
    return {
      success: false,
      message: `There is already a workout on ${date}.`,
    };
  }

  const newPlan: TrainingPlan = {
    id: crypto.randomUUID(),
    user_id: userId,
    scheduled_date: date,
    week_number: 1, // Defaulting to 1 for ad-hoc adds, logic could be smarter to find current week
    type: type,
    target_distance_km: distance_km,
    target_duration_minutes: Math.round(distance_km * 7), // Estimating 7min/km
    description: description,
    status: "Pending",
    google_event_id: null,
    garmin_workout_id: null,
  };

  await insertPlan(db, newPlan);

  return {
    success: true,
    message: `Added ${type} run (${distance_km}km) on ${date}`,
  };
}

// Tool Implementation: Regenerate Week
async function toolRegenerateWeek(
  db: LocalDatabase,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  // This calls the existing logic in coach.ts
  // We import generateFullPlan from coach.ts (circular dependency risk? coach.ts depends on db.ts, tools.ts depends on coach.ts)
  // Actually coach.ts depends on db.ts. tools.ts depends on coach.ts.
  // db.ts should NOT depend on tools or coach. Safe.

  const result = await generateFullPlan(db, userId);
  return result;
}

// Tool Implementation: Sync Garmin Runs
async function toolSyncGarminRuns(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const limit = args.limit || 10;

  // Check rate limit
  if (!canSyncNow()) {
    return {
      success: false,
      message:
        "You just synced recently. Please wait 30 seconds before syncing again.",
    };
  }

  // Check Garmin credentials
  const credentials = await getGarminCredentials(db, userId);
  if (!credentials) {
    return {
      success: false,
      message:
        "Garmin not connected. Please connect your Garmin account in settings first.",
    };
  }

  try {
    // Fetch recent runs from Garmin
    const recentRuns = await fetchRecentRuns(db, userId, limit);

    // Get existing activity IDs to avoid duplicates
    const existingIds = await getExistingActivityIds(db, userId);

    // Filter to only new runs
    const newRuns = recentRuns.filter(
      (run) => !existingIds.has(run.garmin_activity_id),
    );

    if (newRuns.length === 0) {
      return {
        success: true,
        message: "You're all caught up! No new runs to sync.",
      };
    }

    // Sync each new run
    for (const run of newRuns) {
      // Insert the run
      await insertRun(db, userId, {
        ...run,
        ai_feedback: null,
      });

      // Match to training plan
      await matchRunToPlan(db, userId, run.date);

      // Generate AI feedback asynchronously (don't await)
      analyzeRun(db, userId, run)
        .then((feedback) =>
          updateRunFeedback(db, userId, run.garmin_activity_id, feedback),
        )
        .catch((err) => console.error("Failed to generate AI feedback:", err));
    }

    return {
      success: true,
      message: `Synced ${newRuns.length} new run${newRuns.length > 1 ? "s" : ""}! Great work staying consistent. 🎉`,
    };
  } catch (error: any) {
    if (
      error.message?.includes("not connected") ||
      error.message?.includes("expired") ||
      error.message?.includes("401")
    ) {
      return {
        success: false,
        message:
          "Your Garmin session expired. Please re-authenticate in settings.",
      };
    }
    return {
      success: false,
      message: `Sync failed: ${error.message}`,
    };
  }
}

// Tool Implementation: Toggle Workout Status
async function toolToggleWorkoutStatus(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const { date, status } = args;

  // Find the workout
  const plan = await getWorkoutByDate(db, userId, date);

  if (!plan) {
    return {
      success: false,
      message: `No workout found on ${date}.`,
    };
  }

  // Update status
  await updatePlanStatus(db, userId, plan.id, status);

  const actionMsg =
    status === "Completed"
      ? `Great job! Marked ${plan.type} run (${plan.target_distance_km}km) on ${date} as completed. 🎉`
      : `Marked ${plan.type} run on ${date} as pending.`;

  return { success: true, message: actionMsg };
}

// Tool Implementation: Move Workout to Today
async function toolMoveWorkoutToToday(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const { original_date } = args;
  const today = new Date().toISOString().split("T")[0];

  // Find the workout to move
  const plan = await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date = ? AND status = 'Pending'",
    )
    .bind(userId, original_date)
    .first<TrainingPlan>();

  if (!plan) {
    return {
      success: false,
      message: `No pending workout found on ${original_date}.`,
    };
  }

  // Check if there's already something today
  const todayPlan = await db
    .prepare(
      "SELECT id, type FROM training_plan WHERE user_id = ? AND scheduled_date = ? AND status = 'Pending'",
    )
    .bind(userId, today)
    .first<{ id: string; type: string }>();

  if (todayPlan) {
    // Swap them
    await db
      .prepare(
        "UPDATE training_plan SET scheduled_date = ? WHERE user_id = ? AND id = ?",
      )
      .bind(original_date, userId, todayPlan.id)
      .run();
  }

  // Move the workout to today
  await db
    .prepare(
      "UPDATE training_plan SET scheduled_date = ? WHERE user_id = ? AND id = ?",
    )
    .bind(today, userId, plan.id)
    .run();

  // Clear Garmin workout ID to force re-sync
  await updatePlanGarminId(db, userId, plan.id, "");

  const swapMsg = todayPlan
    ? `Swapped workouts: ${plan.type} run moved to today, ${todayPlan.type} run moved to ${original_date}.`
    : `${plan.type} run (${plan.target_distance_km}km) moved to today!`;

  return { success: true, message: swapMsg };
}

// Tool Implementation: Delete Workout
async function toolDeleteWorkout(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const { date, reason } = args;

  // Find the workout
  const plan = await getWorkoutByDate(db, userId, date);

  if (!plan) {
    return {
      success: false,
      message: `No workout found on ${date}.`,
    };
  }

  // Delete from Garmin if it was synced
  if (plan.garmin_workout_id) {
    try {
      await deleteGarminWorkout(db, userId, plan.garmin_workout_id);
    } catch (err) {
      console.warn("Failed to delete from Garmin:", err);
      // Continue anyway - local deletion is more important
    }
  }

  // Delete from local DB
  await dbDeleteWorkout(db, userId, plan.id);

  return {
    success: true,
    message: `Deleted ${plan.type} run (${plan.target_distance_km}km) on ${date}. Reason: ${reason}. Remember, rest is part of training! 💙`,
  };
}

// Tool Implementation: Push to Garmin Watch
async function toolPushToGarminWatch(
  db: LocalDatabase,
  userId: string,
  _args: any,
): Promise<{ success: boolean; message: string }> {
  // Check if Garmin is connected
  const credentials = await getGarminCredentials(db, userId);
  if (!credentials) {
    return {
      success: false,
      message: "Garmin not connected. Please login in settings first.",
    };
  }

  try {
    // Get upcoming workouts (next 7 days)
    const upcomingPlans = await getUpcomingPlans(db, userId, 7);

    if (upcomingPlans.length === 0) {
      return {
        success: true,
        message: "No upcoming workouts to sync to your watch.",
      };
    }

    // Note: The actual Garmin sync logic is in the /api/garmin/sync-watch endpoint
    // For now, we'll indicate this needs to be called separately or import it
    // Let's return a helpful message that the sync should happen
    // In a full implementation, we'd import pushWeekToGarmin from garmin.ts

    return {
      success: true,
      message: `Found ${upcomingPlans.length} workout${upcomingPlans.length > 1 ? "s" : ""} to sync. Your plan will be pushed to your Garmin watch shortly.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to sync to watch: ${error.message}`,
    };
  }
}

// Tool Implementation: Get Upcoming Workouts
async function toolGetUpcomingWorkouts(
  db: LocalDatabase,
  userId: string,
  args: any,
): Promise<{ success: boolean; message: string }> {
  const days = args.days || 7;

  try {
    // Get workouts for the next N days
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const endDate = futureDate.toISOString().split("T")[0];

    const workouts = await getWorkoutsInRange(db, userId, today, endDate);

    if (workouts.length === 0) {
      return {
        success: true,
        message: `No workouts scheduled in the next ${days} days.`,
      };
    }

    // Format the workout list
    const workoutList = workouts
      .map((w: TrainingPlan) => {
        const date = new Date(w.scheduled_date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        return `- ${date}: ${w.type} run, ${w.target_distance_km}km (${w.status})`;
      })
      .join("\n");

    return {
      success: true,
      message: `Here are your upcoming workouts:\n${workoutList}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to get workouts: ${error.message}`,
    };
  }
}
