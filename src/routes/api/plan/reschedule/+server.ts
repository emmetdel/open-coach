import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { LocalDatabase } from "$lib/server/sqlite";

interface RescheduleRequest {
  planId: string;
  action:
    | "move_tomorrow"
    | "swap_next"
    | "convert_walk"
    | "skip"
    | "run_now"
    | "reschedule_to_date";
  newDate?: string; // Required for 'reschedule_to_date' action
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const db = locals.db as LocalDatabase;
  if (!db) {
    return json(
      { success: false, error: "Database not available" },
      { status: 500 },
    );
  }

  try {
    const body: RescheduleRequest = await request.json();
    const { planId, action } = body;

    if (!planId || !action) {
      return json(
        { success: false, error: "Missing planId or action" },
        { status: 400 },
      );
    }

    // Get the current plan
    const plan = await db
      .prepare("SELECT * FROM training_plan WHERE id = ?")
      .bind(planId)
      .first<{
        id: string;
        scheduled_date: string;
        type: string;
        target_distance_km: number;
        target_duration_minutes: number;
        description: string;
        garmin_workout_id: string | null;
      }>();

    if (!plan) {
      return json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const today = new Date().toISOString().split("T")[0];

    switch (action) {
      case "move_tomorrow": {
        // Move today's run to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split("T")[0];

        // Check if there's already a run tomorrow
        const tomorrowPlan = await db
          .prepare(
            "SELECT id FROM training_plan WHERE scheduled_date = ? AND status = ?",
          )
          .bind(tomorrowStr, "Pending")
          .first<{ id: string }>();

        if (tomorrowPlan) {
          // Swap: move tomorrow's run to today
          await db
            .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
            .bind(today, tomorrowPlan.id)
            .run();
        }

        // Move today's run to tomorrow
        await db
          .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
          .bind(tomorrowStr, planId)
          .run();

        // Update Garmin if needed (delete and recreate)
        if (plan.garmin_workout_id) {
          const { deleteGarminWorkout, pushWeekToGarmin } =
            await import("$lib/server/garmin");
          await deleteGarminWorkout(db, plan.garmin_workout_id);
          await db
            .prepare(
              "UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?",
            )
            .bind(planId)
            .run();

          // Re-sync workouts for the next 7 days
          await pushWeekToGarmin(db);
        }

        return json({
          success: true,
          message: tomorrowPlan
            ? `Swapped workouts: today's run moved to tomorrow, tomorrow's run moved to today.`
            : `Moved today's run to tomorrow.`,
        });
      }

      case "swap_next": {
        // Find the next scheduled run after today
        const nextPlan = await db
          .prepare(
            `
						SELECT id, scheduled_date FROM training_plan
						WHERE scheduled_date > ? AND status = ?
						ORDER BY scheduled_date ASC LIMIT 1
					`,
          )
          .bind(today, "Pending")
          .first<{ id: string; scheduled_date: string }>();

        if (!nextPlan) {
          return json(
            { success: false, error: "No upcoming run to swap with" },
            { status: 400 },
          );
        }

        // Swap the dates
        await db
          .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
          .bind(nextPlan.scheduled_date, planId)
          .run();
        await db
          .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
          .bind(today, nextPlan.id)
          .run();

        // Re-sync Garmin workouts
        if (plan.garmin_workout_id) {
          const { pushWeekToGarmin } = await import("$lib/server/garmin");
          await pushWeekToGarmin(db);
        }

        const swapDate = new Date(
          nextPlan.scheduled_date + "T12:00:00",
        ).toLocaleDateString("en-US", {
          weekday: "long",
        });

        return json({
          success: true,
          message: `Swapped today's run with ${swapDate}'s run.`,
        });
      }

      case "convert_walk": {
        // Convert today's run to an easy 20-minute walk
        await db
          .prepare(
            `
					UPDATE training_plan
					SET type = 'Walk',
					    target_distance_km = NULL,
					    target_duration_minutes = 20,
					    description = 'Recovery walk - take it easy and enjoy being outside'
					WHERE id = ?
				`,
          )
          .bind(planId)
          .run();

        // Delete the Garmin workout if exists (walks don't need structured workouts)
        if (plan.garmin_workout_id) {
          const { deleteGarminWorkout } = await import("$lib/server/garmin");
          await deleteGarminWorkout(db, plan.garmin_workout_id);
          await db
            .prepare(
              "UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?",
            )
            .bind(planId)
            .run();
        }

        return json({
          success: true,
          message: `Converted today's run to a 20-minute recovery walk. Movement without stress!`,
        });
      }

      case "skip": {
        // Mark as skipped with a note
        await db
          .prepare(
            `
					UPDATE training_plan
					SET status = 'Skipped',
					    description = description || ' [Skipped for recovery]'
					WHERE id = ?
				`,
          )
          .bind(planId)
          .run();

        // Delete the Garmin workout
        if (plan.garmin_workout_id) {
          const { deleteGarminWorkout } = await import("$lib/server/garmin");
          await deleteGarminWorkout(db, plan.garmin_workout_id);
          await db
            .prepare(
              "UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?",
            )
            .bind(planId)
            .run();
        }

        return json({
          success: true,
          message: `Today's run skipped. Rest is training too! 💪`,
        });
      }

      case "run_now": {
        // Reschedule the run to today and sync to Garmin
        const today = new Date().toISOString().split("T")[0];

        // Update the scheduled date to today
        await db
          .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
          .bind(today, planId)
          .run();

        // Sync to Garmin watch
        const { pushWeekToGarmin } = await import("$lib/server/garmin");
        await pushWeekToGarmin(db);

        return json({
          success: true,
          message: `Run scheduled for today and synced to your watch!`,
        });
      }

      case "reschedule_to_date": {
        const { newDate } = body;

        if (!newDate) {
          return json(
            {
              success: false,
              error: "newDate is required for reschedule_to_date action",
            },
            { status: 400 },
          );
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return json(
            { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
            { status: 400 },
          );
        }

        // Check if there's already a run on the new date
        const existingPlan = await db
          .prepare(
            "SELECT id, type FROM training_plan WHERE scheduled_date = ? AND status = ?",
          )
          .bind(newDate, "Pending")
          .first<{ id: string; type: string }>();

        if (existingPlan) {
          // Swap the dates
          await db
            .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
            .bind(plan.scheduled_date, existingPlan.id)
            .run();

          await db
            .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
            .bind(newDate, planId)
            .run();

          // Re-sync Garmin workouts
          if (plan.garmin_workout_id || existingPlan) {
            const { pushWeekToGarmin } = await import("$lib/server/garmin");
            await pushWeekToGarmin(db);
          }

          const oldDate = new Date(
            plan.scheduled_date + "T12:00:00",
          ).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });
          const newDateFormatted = new Date(
            newDate + "T12:00:00",
          ).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });

          return json({
            success: true,
            message: `Swapped runs: ${plan.type} run moved to ${newDateFormatted}, ${existingPlan.type} run moved to ${oldDate}.`,
          });
        } else {
          // Just move the run to the new date
          await db
            .prepare("UPDATE training_plan SET scheduled_date = ? WHERE id = ?")
            .bind(newDate, planId)
            .run();

          // Update Garmin if needed
          if (plan.garmin_workout_id) {
            const { deleteGarminWorkout, pushWeekToGarmin } =
              await import("$lib/server/garmin");
            await deleteGarminWorkout(db, plan.garmin_workout_id);
            await db
              .prepare(
                "UPDATE training_plan SET garmin_workout_id = NULL WHERE id = ?",
              )
              .bind(planId)
              .run();

            // Re-sync workouts
            await pushWeekToGarmin(db);
          }

          const newDateFormatted = new Date(
            newDate + "T12:00:00",
          ).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });

          return json({
            success: true,
            message: `${plan.type} run rescheduled to ${newDateFormatted}.`,
          });
        }
      }

      default:
        return json(
          { success: false, error: "Invalid action" },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("Reschedule error:", err);
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to reschedule",
      },
      { status: 500 },
    );
  }
};
