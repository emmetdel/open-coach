import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getRecentRuns, hasCompletedSetup } from "$lib/server/db";
import {
  formatDistance,
  formatDuration,
  calculatePace,
} from "$lib/server/garmin";

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

  // Fetch all runs for analytics
  const runs = await getRecentRuns(db, userId, 1000);

  // Fetch training plan data for consistency tracking
  const allPlans = await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? ORDER BY scheduled_date ASC",
    )
    .bind(userId)
    .all<{ scheduled_date: string; status: string; type: string }>();

  // Calculate consistency metrics (even if no runs yet)
  const consistencyData = calculateConsistencyMetrics(runs, allPlans.results);

  if (runs.length === 0) {
    return {
      hasRuns: false,
      runs: [],
      paceData: [],
      volumeData: [],
      personalRecords: {},
      hrZoneData: [],
      totalStats: {
        totalRuns: 0,
        totalDistance: "0 km",
        totalDuration: "0:00",
        avgPace: "--",
        longestRun: "0 km",
        fastestPace: "--",
      },
      consistency: consistencyData,
    };
  }

  // Calculate pace progression data (last 50 runs)
  const recentRuns = runs.slice(0, Math.min(50, runs.length));
  const paceData = recentRuns.reverse().map((run, index) => ({
    runNumber: Math.max(1, runs.length - recentRuns.length + index + 1),
    date: new Date(run.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    pace: calculatePace(run.distance_meters, run.duration_seconds),
    paceSeconds: (run.duration_seconds / run.distance_meters) * 1000,
    distance: run.distance_meters / 1000,
  }));

  // Calculate weekly volume data (last 12 weeks)
  const weeklyVolume = new Map<string, number>();
  const now = new Date();

  runs.forEach((run) => {
    const runDate = new Date(run.date);
    const weekStart = new Date(runDate);
    weekStart.setDate(runDate.getDate() - runDate.getDay()); // Start of week
    const weekKey = weekStart.toISOString().split("T")[0];

    const weekDiff = Math.floor(
      (now.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (weekDiff < 12) {
      weeklyVolume.set(
        weekKey,
        (weeklyVolume.get(weekKey) || 0) + run.distance_meters,
      );
    }
  });

  const volumeData = Array.from(weeklyVolume.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week, distance]) => ({
      week: new Date(week).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      distance: (distance / 1000).toFixed(1),
      distanceKm: distance / 1000,
    }));

  // Calculate personal records
  const distances = [1000, 5000, 10000, 21097.5, 42195]; // 1k, 5k, 10k, half, full
  const personalRecords: Record<
    string,
    { time: string; pace: string; date: string } | null
  > = {};

  distances.forEach((targetDistance) => {
    const distanceName =
      targetDistance === 1000
        ? "1km"
        : targetDistance === 5000
          ? "5km"
          : targetDistance === 10000
            ? "10km"
            : targetDistance === 21097.5
              ? "Half Marathon"
              : "Marathon";

    // Find runs close to this distance (within 5%)
    const candidateRuns = runs.filter((run) => {
      const diff = Math.abs(run.distance_meters - targetDistance);
      return diff < targetDistance * 0.05;
    });

    if (candidateRuns.length > 0) {
      // Find fastest
      const fastest = candidateRuns.reduce((best, run) => {
        const pace = (run.duration_seconds / run.distance_meters) * 1000;
        const bestPace = (best.duration_seconds / best.distance_meters) * 1000;
        return pace < bestPace ? run : best;
      });

      personalRecords[distanceName] = {
        time: formatDuration(fastest.duration_seconds),
        pace: calculatePace(fastest.distance_meters, fastest.duration_seconds),
        date: new Date(fastest.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
    } else {
      personalRecords[distanceName] = null;
    }
  });

  // Calculate HR zone distribution
  const hrZones = {
    "Zone 1 (Recovery)": 0,
    "Zone 2 (Easy)": 0,
    "Zone 3 (Moderate)": 0,
    "Zone 4 (Hard)": 0,
    "Zone 5 (Max)": 0,
  };

  runs
    .filter((r) => r.avg_hr)
    .forEach((run) => {
      if (run.avg_hr! <= 140) hrZones["Zone 1 (Recovery)"]++;
      else if (run.avg_hr! <= 150) hrZones["Zone 2 (Easy)"]++;
      else if (run.avg_hr! <= 160) hrZones["Zone 3 (Moderate)"]++;
      else if (run.avg_hr! <= 170) hrZones["Zone 4 (Hard)"]++;
      else hrZones["Zone 5 (Max)"]++;
    });

  const hrZoneData = Object.entries(hrZones).map(([zone, count]) => ({
    zone,
    count,
  }));

  // Calculate total stats
  const totalDistance = runs.reduce((sum, r) => sum + r.distance_meters, 0);
  const totalDuration = runs.reduce((sum, r) => sum + r.duration_seconds, 0);
  const avgPaceSeconds = totalDuration / (totalDistance / 1000);
  const longestRun = Math.max(...runs.map((r) => r.distance_meters));
  const fastestPace = Math.min(
    ...runs.map((r) => (r.duration_seconds / r.distance_meters) * 1000),
  );

  return {
    hasRuns: true,
    runs: runs.slice(0, 20).map((run) => ({
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
    })),
    paceData,
    volumeData,
    personalRecords,
    hrZoneData,
    totalStats: {
      totalRuns: runs.length,
      totalDistance: formatDistance(totalDistance),
      totalDuration: formatDuration(totalDuration),
      avgPace: formatDuration(Math.round(avgPaceSeconds * 60)) + "/km",
      longestRun: formatDistance(longestRun),
      fastestPace: formatDuration(Math.round(fastestPace * 60)) + "/km",
    },
    consistency: consistencyData,
  };
};

// Calculate consistency metrics
function calculateConsistencyMetrics(
  runs: any[],
  plans: { scheduled_date: string; status: string; type: string }[]
) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Calculate weekly completion rates (last 7 weeks + current week)
  const weeklyData: {
    week: string;
    planned: number;
    completed: number;
    rate: number;
  }[] = [];

  // Include current/future week (i = -1) to show in-progress data
  for (let i = 7; i >= -1; i--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (i * 7 + today.getDay()));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekPlans = plans.filter((p) => {
      const planDate = new Date(p.scheduled_date);
      const isInWeek = planDate >= weekStart && planDate <= weekEnd;
      const isNotRest = p.type !== "Rest";

      // Count completed plans even if in future (ran early)
      // Only exclude pending future plans
      const shouldCount = p.status === "Completed" || planDate <= today;

      return isInWeek && isNotRest && shouldCount;
    });

    const completed = weekPlans.filter(
      (p) => p.status === "Completed"
    ).length;
    const planned = weekPlans.length;

    weeklyData.push({
      week: weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      planned,
      completed,
      rate: planned > 0 ? Math.round((completed / planned) * 100) : 0,
    });
  }

  // Calculate current streak (consecutive weeks with ≥75% completion)
  let currentStreak = 0;
  for (let i = weeklyData.length - 1; i >= 0; i--) {
    if (weeklyData[i].rate >= 75) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Calculate best streak
  let bestStreak = 0;
  let tempStreak = 0;
  for (const week of weeklyData) {
    if (week.rate >= 75) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  // Calculate habit health score (0-100)
  const last4Weeks = weeklyData.slice(-4);
  const avgCompletion =
    last4Weeks.reduce((sum, w) => sum + w.rate, 0) / last4Weeks.length;
  const habitHealth = Math.round(avgCompletion);

  // Generate calendar heatmap data (last 90 days)
  const calendarData: { date: string; count: number; hasRun: boolean }[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const runsOnDay = runs.filter((r) => {
      const runDate = new Date(r.date).toISOString().split("T")[0];
      return runDate === dateStr;
    });

    calendarData.push({
      date: dateStr,
      count: runsOnDay.length,
      hasRun: runsOnDay.length > 0,
    });
  }

  // Get health status and message
  let healthStatus: "excellent" | "good" | "slipping" | "needsWork";
  let healthMessage: string;

  if (habitHealth >= 90) {
    healthStatus = "excellent";
    healthMessage = "Outstanding consistency! You're crushing it! 🔥";
  } else if (habitHealth >= 75) {
    healthStatus = "good";
    healthMessage = "Great consistency! Keep showing up! 💪";
  } else if (habitHealth >= 50) {
    healthStatus = "slipping";
    healthMessage = "You're slipping a bit. Let's get back on track! 🎯";
  } else {
    healthStatus = "needsWork";
    healthMessage = "Time to rebuild the habit. One run at a time! 🌱";
  }

  return {
    weeklyCompletion: weeklyData,
    currentStreak,
    bestStreak,
    habitHealth,
    healthStatus,
    healthMessage,
    calendarData,
  };
}
