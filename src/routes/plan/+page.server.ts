import type { PageServerLoad } from "./$types";
import {
  getPlansGroupedByWeek,
  getPlanMetadata,
  getCurrentWeekNumber,
  hasCompletedSetup,
} from "$lib/server/db";
import { redirect } from "@sveltejs/kit";

export interface WeekDisplay {
  weekNumber: number;
  startDate: string;
  endDate: string;
  workouts: WorkoutDisplay[];
  totalWorkouts: number;
  isCurrentWeek: boolean;
}

export interface WorkoutDisplay {
  id: string;
  day: string;
  type: string;
  distance: string | null;
  duration: string | null;
  description: string;
  status: string;
  scheduledDate: string;
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

  const [plansGrouped, metadata, currentWeek] = await Promise.all([
    getPlansGroupedByWeek(db),
    getPlanMetadata(db),
    getCurrentWeekNumber(db),
  ]);

  const planName = metadata["plan_name"] || "Your Training Plan";
  const totalWeeks = parseInt(metadata["total_weeks"] || "0", 10);
  const startDate =
    metadata["start_date"] || new Date().toISOString().split("T")[0];

  // Convert to array of weeks for display
  const weeks: WeekDisplay[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const weekPlans = plansGrouped.get(w) || [];
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (w - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const workouts: WorkoutDisplay[] = weekPlans.map((plan) => {
      const date = new Date(plan.scheduled_date + "T12:00:00");
      return {
        id: plan.id,
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        type: plan.type,
        distance: plan.target_distance_km
          ? `${plan.target_distance_km}km`
          : null,
        duration: plan.target_duration_minutes
          ? `${plan.target_duration_minutes} min`
          : null,
        description: plan.description,
        status: plan.status,
        scheduledDate: plan.scheduled_date,
      };
    });

    weeks.push({
      weekNumber: w,
      startDate: weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      endDate: weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      workouts,
      totalWorkouts: workouts.length,
      isCurrentWeek: w === currentWeek,
    });
  }

  return {
    planName,
    totalWeeks,
    currentWeek,
    completedWeeks: Math.max(0, currentWeek - 1),
    weeks,
    hasPlan: totalWeeks > 0,
  };
};
