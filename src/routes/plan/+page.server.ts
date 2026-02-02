import type { PageServerLoad } from "./$types";
import {
  getPlanMetadata,
  getCurrentWeekNumber,
  hasCompletedSetup,
  getActiveGoals,
} from "$lib/server/db";
import { redirect } from "@sveltejs/kit";

export interface CalendarRun {
  id: string;
  date: string; // YYYY-MM-DD
  type: string;
  distance: string | null;
  duration: string | null;
  status: 'Pending' | 'Completed' | 'Missed';
}

export const load: PageServerLoad = async ({ locals }) => {
  const db = locals.db;
  if (!db) {
    throw new Error("Database not available");
  }
  if (!locals.user) {
    throw redirect(302, "/login");
  }
  const userId = locals.user.id;

  const isSetup = await hasCompletedSetup(db, userId);
  if (!isSetup) {
    throw redirect(307, "/setup");
  }

  const [metadata, currentWeek, goals] = await Promise.all([
    getPlanMetadata(db, userId),
    getCurrentWeekNumber(db, userId),
    getActiveGoals(db, userId),
  ]);

  const planName = metadata["plan_name"] || "Your Training Plan";
  const totalWeeks = parseInt(metadata["total_weeks"] || "0", 10);
  const primaryGoal = goals[0] || null;

  // Get all training plans for calendar
  const allPlans = await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? ORDER BY scheduled_date ASC",
    )
    .bind(userId)
    .all<{
      id: string;
      scheduled_date: string;
      type: string;
      target_distance_km: number | null;
      target_duration_minutes: number | null;
      status: string;
    }>();

  // Convert to calendar format
  const runs: CalendarRun[] = allPlans.results.map((plan) => ({
    id: plan.id,
    date: plan.scheduled_date,
    type: plan.type,
    distance: plan.target_distance_km ? `${plan.target_distance_km}km` : null,
    duration: plan.target_duration_minutes ? `${plan.target_duration_minutes} min` : null,
    status: plan.status as 'Pending' | 'Completed' | 'Missed',
  }));

  return {
    planName,
    totalWeeks,
    currentWeek,
    completedWeeks: Math.max(0, currentWeek - 1),
    runs,
    hasPlan: totalWeeks > 0,
    primaryGoal,
    generationStrategy: metadata["generation_strategy"] || "legacy",
  };
};
