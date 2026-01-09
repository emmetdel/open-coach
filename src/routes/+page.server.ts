import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  getRecentRuns,
  getConsistencyStats,
  hasCompletedSetup,
  getUpcomingPlans,
  getNextRun,
} from "$lib/server/db";
import {
  formatDistance,
  formatDuration,
  calculatePace,
  getHealthSnapshot,
  type HealthSnapshot,
} from "$lib/server/garmin";
import {
  calculateStreak,
  getProgressStats,
  getBeginnerTips,
} from "$lib/server/reminders";

export interface RunDisplay {
  garmin_activity_id: string;
  date: string;
  dateFormatted: string;
  distance: string;
  duration: string;
  pace: string;
  avg_hr: number | null;
  ai_feedback: string | null;
}

export interface WeekStats {
  week: string;
  count: number;
}

export interface PlanDisplay {
  id: string;
  scheduled_date: string;
  dateFormatted: string;
  dayName: string;
  type: string;
  distance: string;
  description: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  const db = locals.db;
  if (!db) {
    throw new Error("Database not available");
  }

  // Check if setup is complete
  const isSetup = await hasCompletedSetup(db);
  if (!isSetup) {
    throw redirect(307, "/setup");
  }

  // Fetch data in parallel
  const [
    runs,
    weeklyStats,
    upcomingPlans,
    nextRun,
    streak,
    progress,
    healthSnapshot,
  ] = await Promise.all([
    getRecentRuns(db, 10),
    getConsistencyStats(db, 8),
    getUpcomingPlans(db, 7),
    getNextRun(db),
    calculateStreak(db),
    getProgressStats(db),
    getHealthSnapshot(db),
  ]);

  // Transform runs for display
  const runsDisplay: RunDisplay[] = runs.map((run) => ({
    garmin_activity_id: run.garmin_activity_id,
    date: run.date,
    dateFormatted: new Date(run.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    distance: formatDistance(run.distance_meters),
    duration: formatDuration(run.duration_seconds),
    pace: calculatePace(run.distance_meters, run.duration_seconds),
    avg_hr: run.avg_hr,
    ai_feedback: run.ai_feedback,
  }));

  // Transform upcoming plans for display
  const plansDisplay: PlanDisplay[] = upcomingPlans.map((plan) => ({
    id: plan.id,
    scheduled_date: plan.scheduled_date,
    dateFormatted: new Date(
      plan.scheduled_date + "T12:00:00",
    ).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    dayName: new Date(plan.scheduled_date + "T12:00:00").toLocaleDateString(
      "en-US",
      {
        weekday: "long",
      },
    ),
    type: plan.type,
    // Show duration for Walk-Run, distance for others
    distance: plan.target_distance_km
      ? `${plan.target_distance_km}km`
      : plan.target_duration_minutes
        ? `${plan.target_duration_minutes} min`
        : "",
    description: plan.description,
  }));

  // Format next run for hero card
  const nextRunDisplay = nextRun
    ? {
        id: nextRun.id,
        dateFormatted: new Date(
          nextRun.scheduled_date + "T12:00:00",
        ).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
        type: nextRun.type,
        // Show duration for Walk-Run, distance for others
        distance: nextRun.target_distance_km
          ? `${nextRun.target_distance_km}km`
          : nextRun.target_duration_minutes
            ? `${nextRun.target_duration_minutes} min`
            : "",
        description: nextRun.description,
      }
    : null;

  // Calculate total stats
  const totalRuns = runs.length;
  const totalDistance = runs.reduce((sum, run) => sum + run.distance_meters, 0);
  const avgWeeklyRuns =
    weeklyStats.length > 0
      ? weeklyStats.reduce((sum, w) => sum + w.count, 0) / weeklyStats.length
      : 0;

  // Get tips for next run type
  const tips = nextRun
    ? getBeginnerTips(nextRun.type)
    : getBeginnerTips("Easy");

  // Check if there's a run scheduled for today
  const today = new Date().toISOString().split("T")[0];
  const todaysRun = upcomingPlans.find((p) => p.scheduled_date === today);

  // Format today's run for the "I'm going" button
  const todaysRunDisplay = todaysRun
    ? {
        id: todaysRun.id,
        type: todaysRun.type,
        distance: todaysRun.target_distance_km
          ? `${todaysRun.target_distance_km}km`
          : todaysRun.target_duration_minutes
            ? `${todaysRun.target_duration_minutes} min`
            : "",
        description: todaysRun.description,
        garminSynced: !!todaysRun.garmin_workout_id,
      }
    : null;

  // Analyze recovery status for smart suggestions
  let recoveryAlert: {
    type: "low" | "moderate" | "good";
    message: string;
    suggestion: "reschedule" | "reduce" | "proceed" | null;
    todaysRunId?: string;
    todaysRunType?: string;
  } | null = null;

  if (todaysRun && healthSnapshot) {
    const bodyBattery = healthSnapshot.bodyBattery?.morning;
    const sleepHours = healthSnapshot.sleep?.durationHours;
    const sleepQuality = healthSnapshot.sleep?.quality;

    // Determine recovery level
    const isLowBattery = bodyBattery !== undefined && bodyBattery < 40;
    const isPoorSleep = sleepHours !== undefined && sleepHours < 5;
    const isModerateBattery =
      bodyBattery !== undefined && bodyBattery >= 40 && bodyBattery < 60;
    const isFairSleep = sleepQuality === "fair" || sleepQuality === "poor";

    if (isLowBattery || isPoorSleep) {
      // Low recovery - suggest rescheduling
      const reasons = [];
      if (isLowBattery) reasons.push(`Body Battery at ${bodyBattery}%`);
      if (isPoorSleep) reasons.push(`only ${sleepHours?.toFixed(1)}h sleep`);

      recoveryAlert = {
        type: "low",
        message: `Your recovery is low today (${reasons.join(", ")}). Pushing through may lead to burnout.`,
        suggestion: "reschedule",
        todaysRunId: todaysRun.id,
        todaysRunType: todaysRun.type,
      };
    } else if (isModerateBattery || isFairSleep) {
      // Moderate recovery - suggest easier workout
      recoveryAlert = {
        type: "moderate",
        message: `Recovery is moderate today. Consider an easier effort or shorter distance.`,
        suggestion: "reduce",
        todaysRunId: todaysRun.id,
        todaysRunType: todaysRun.type,
      };
    }
  }

  return {
    runs: runsDisplay,
    weeklyStats,
    upcomingPlans: plansDisplay,
    nextRun: nextRunDisplay,
    stats: {
      totalRuns,
      totalDistance: formatDistance(totalDistance),
      avgWeeklyRuns: avgWeeklyRuns.toFixed(1),
    },
    streak: {
      current: streak.currentStreak,
      longest: streak.longestStreak,
      lastRunDate: streak.lastRunDate,
    },
    progress: {
      firstRun: progress.firstRun,
      latestRun: progress.latestRun,
      totalRuns: progress.totalRuns,
      totalDistance: progress.totalDistance.toFixed(1),
      totalDuration: Math.round(progress.totalDuration),
      paceImprovement: progress.avgPaceImprovement
        ? `${progress.avgPaceImprovement.toFixed(0)}%`
        : null,
      weeklyProgress: progress.weeklyProgress,
    },
    tips,
    health: healthSnapshot,
    recoveryAlert,
    todaysRun: todaysRunDisplay,
  };
};
