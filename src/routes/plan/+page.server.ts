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

  const isSetup = await hasCompletedSetup(db);
  if (!isSetup) {
    throw redirect(307, "/setup");
  }

  const [metadata, currentWeek, goals] = await Promise.all([
    getPlanMetadata(db),
    getCurrentWeekNumber(db),
    getActiveGoals(db),
  ]);

  const planName = metadata["plan_name"] || "Your Training Plan";
  const totalWeeks = parseInt(metadata["total_weeks"] || "0", 10);
  const primaryGoal = goals.find((g) => g.is_primary) || null;

  // Get all training plans for calendar
  const allPlans = await db
    .prepare('SELECT * FROM training_plan ORDER BY scheduled_date ASC')
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
