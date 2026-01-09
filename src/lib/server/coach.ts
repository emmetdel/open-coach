// AI Coach service using OpenRouter
import {
  getSetting,
  getSettings,
  SETTING_KEYS,
  DEFAULT_MODEL,
  insertPlan,
  deleteFuturePlans,
  deleteAllPlans,
  getRecentRuns,
  setPlanMetadata,
} from "./db";
import type { Run, TrainingPlan } from "./db";
import { formatDistance, formatDuration, calculatePace } from "./garmin";
import {
  getRunFeedbackSystemPrompt,
  getRunFeedbackUserPrompt,
  getMilestoneCelebration,
  getMilestoneContext,
  DEFAULT_FEEDBACK_MESSAGES,
} from "$lib/prompts";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

// Call OpenRouter API
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens = 200,
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://opencoach.run",
      "X-Title": "OpenCoach",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  return data.choices[0]?.message?.content ?? "Great effort today!";
}

import type { LocalDatabase } from "./sqlite";

type Database = LocalDatabase;

// Get configured model or default
async function getModel(db: Database): Promise<string> {
  const model = await getSetting(db, SETTING_KEYS.OPENROUTER_MODEL);
  return model || DEFAULT_MODEL;
}

// Get OpenRouter credentials from env or DB
async function getOpenRouterCredentials(
  db: Database,
): Promise<{ apiKey: string | null; model: string }> {
  // Prefer environment variables
  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    };
  }

  // Fall back to DB settings
  const settings = await getSettings(db, [
    SETTING_KEYS.OPENROUTER_KEY,
    SETTING_KEYS.OPENROUTER_MODEL,
  ]);

  return {
    apiKey: settings[SETTING_KEYS.OPENROUTER_KEY] || null,
    model: settings[SETTING_KEYS.OPENROUTER_MODEL] || DEFAULT_MODEL,
  };
}

// Analyze a completed run and provide empathetic feedback
export async function analyzeRun(
  db: Database,
  run: Omit<Run, "ai_feedback" | "synced_to_calendar">,
): Promise<string> {
  const { apiKey, model } = await getOpenRouterCredentials(db);

  // Get run count for milestones
  const recentRuns = await getRecentRuns(db, 100);
  const runNumber = recentRuns.length + 1; // This will be their nth run

  // Get celebration prefix and context from centralized prompts
  const celebrationPrefix = getMilestoneCelebration(runNumber);
  const milestoneContext = getMilestoneContext(runNumber);

  if (!apiKey) {
    return (
      celebrationPrefix +
      DEFAULT_FEEDBACK_MESSAGES[
        Math.floor(Math.random() * DEFAULT_FEEDBACK_MESSAGES.length)
      ]
    );
  }

  const distance = formatDistance(run.distance_meters);
  const duration = formatDuration(run.duration_seconds);
  const pace = calculatePace(run.distance_meters, run.duration_seconds);

  // Build detailed HR context with zones
  let hrContext = "";
  if (run.avg_hr) {
    let zone = "";
    let effort = "";
    if (run.avg_hr > 170) {
      zone = "Zone 5 (Max)";
      effort = "very high intensity";
    } else if (run.avg_hr > 160) {
      zone = "Zone 4 (Hard)";
      effort = "high intensity";
    } else if (run.avg_hr > 150) {
      zone = "Zone 3 (Moderate)";
      effort = "moderate intensity";
    } else if (run.avg_hr > 140) {
      zone = "Zone 2 (Easy)";
      effort = "easy/aerobic";
    } else {
      zone = "Zone 1 (Recovery)";
      effort = "very easy/recovery";
    }
    hrContext = `- Average HR: ${run.avg_hr} bpm (${zone} - ${effort})`;
    if (run.max_hr) {
      hrContext += `\n- Max HR: ${run.max_hr} bpm`;
    }
  }

  // Build comparison context with recent runs
  let comparisonContext = "";
  if (recentRuns.length > 0) {
    // Get similar distance runs (within 20% of current distance)
    const similarRuns = recentRuns
      .filter((r) => {
        const distDiff = Math.abs(r.distance_meters - run.distance_meters);
        return distDiff < run.distance_meters * 0.2;
      })
      .slice(0, 5);

    if (similarRuns.length > 0) {
      const avgPreviousPace =
        similarRuns.reduce((sum, r) => {
          const paceSeconds = (r.duration_seconds / r.distance_meters) * 1000;
          return sum + paceSeconds;
        }, 0) / similarRuns.length;

      const currentPaceSeconds =
        (run.duration_seconds / run.distance_meters) * 1000;
      const paceDiff = currentPaceSeconds - avgPreviousPace;
      const paceChangePercent = (
        (Math.abs(paceDiff) / avgPreviousPace) *
        100
      ).toFixed(1);

      if (Math.abs(paceDiff) > 5) {
        // More than 5 seconds per km difference
        const fasterOrSlower = paceDiff < 0 ? "faster" : "slower";
        comparisonContext += `📈 Recent Performance:\n- This pace is ${paceChangePercent}% ${fasterOrSlower} than your recent ${distance} runs`;
      }
    }

    // Overall statistics
    const totalRuns = recentRuns.length;
    const totalDistance = recentRuns.reduce(
      (sum, r) => sum + r.distance_meters,
      0,
    );
    const avgDistance = formatDistance(totalDistance / totalRuns);

    if (!comparisonContext) {
      comparisonContext = `📈 Your Progress:\n- Total runs: ${totalRuns}\n- Average distance: ${avgDistance}`;
    }
  }

  // Use centralized prompts
  const systemPrompt = getRunFeedbackSystemPrompt(milestoneContext);
  const userPrompt = getRunFeedbackUserPrompt(
    distance,
    duration,
    pace,
    hrContext,
    comparisonContext,
  );

  try {
    const feedback = await callOpenRouter(apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    return celebrationPrefix + feedback;
  } catch (error) {
    console.error("Failed to get AI feedback:", error);
    return (
      celebrationPrefix +
      "Amazing work showing up today! Every run is a victory."
    );
  }
}

// Validate OpenRouter API key by making a test request
export async function validateApiKey(
  apiKey: string,
  model?: string,
): Promise<boolean> {
  try {
    await callOpenRouter(
      apiKey,
      model || DEFAULT_MODEL,
      [{ role: "user", content: 'Say "OK" if this works.' }],
      10,
    );
    return true;
  } catch {
    return false;
  }
}

// Safety check: validate AI-suggested distance (max 15km for beginners)
export function validateSuggestedDistance(
  distanceKm: number,
  isExperienced: boolean,
): number {
  const maxDistance = isExperienced ? 25 : 15;
  const minDistance = 1;

  if (distanceKm > maxDistance) {
    console.warn(`AI suggested ${distanceKm}km, capping at ${maxDistance}km`);
    return maxDistance;
  }
  if (distanceKm < minDistance) {
    return minDistance;
  }
  return distanceKm;
}

// =========== Training Plan Generation ===========

interface PlannedRun {
  day: string; // e.g., "Mon", "Wed"
  type: "Easy" | "Interval" | "Long" | "Rest" | "Walk-Run";
  distance_km: number;
  duration_minutes?: number;
  description: string;
}

interface WeekPlan {
  week_number: number;
  runs: PlannedRun[];
  focus: string; // e.g., "Building base", "Adding distance"
}

interface FullPlanResponse {
  weeks: WeekPlan[];
  plan_name: string;
  total_weeks: number;
}

// Generate a full multi-week training plan (like Runna)
export async function generateFullPlan(
  db: Database,
): Promise<{
  success: boolean;
  runsCreated: number;
  totalWeeks: number;
  message: string;
}> {
  // Get user's settings
  const settings = await getSettings(db, [
    SETTING_KEYS.TARGET_DATE,
    SETTING_KEYS.AVAILABLE_DAYS,
    SETTING_KEYS.CURRENT_FITNESS,
  ]);

  const targetDate = settings[SETTING_KEYS.TARGET_DATE];
  const availableDaysJson = settings[SETTING_KEYS.AVAILABLE_DAYS];
  const currentFitness = settings[SETTING_KEYS.CURRENT_FITNESS] || "";

  if (!targetDate || !availableDaysJson) {
    return {
      success: false,
      runsCreated: 0,
      totalWeeks: 0,
      message:
        "Please complete setup with your target date and available days.",
    };
  }

  const availableDays: string[] = JSON.parse(availableDaysJson);

  // Calculate weeks until goal
  // Generate full plan for visibility, but only next 7 days sync to Garmin
  const today = new Date();
  const goalDate = new Date(targetDate);
  const daysUntilGoal = Math.ceil(
    (goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weeksUntilGoal = Math.max(1, Math.ceil(daysUntilGoal / 7));

  // Cap at reasonable max (16 weeks is typical training plan length)
  const totalWeeks = Math.min(weeksUntilGoal, 16);

  // Determine fitness level
  const isComplete =
    currentFitness.toLowerCase().includes("5k") ||
    currentFitness.toLowerCase().includes("regular") ||
    currentFitness.toLowerCase().includes("experienced");

  // Generate a structured plan (full plan shown in app, only 7 days sync to Garmin)
  return generateStructuredPlan(db, availableDays, totalWeeks, isComplete);
}

// Generate a structured multi-week plan (Runna-style)
async function generateStructuredPlan(
  db: Database,
  availableDays: string[],
  totalWeeks: number,
  isExperienced: boolean,
): Promise<{
  success: boolean;
  runsCreated: number;
  totalWeeks: number;
  message: string;
}> {
  // Delete old workouts from Garmin first (before clearing local DB)
  try {
    const { deleteAllOpenCoachWorkouts } = await import("./garmin");
    const deleteResult = await deleteAllOpenCoachWorkouts(db);
    console.log(`Deleted ${deleteResult.deleted} old workouts from Garmin`);
  } catch (err) {
    console.warn("Could not delete old Garmin workouts:", err);
    // Continue anyway - workouts will still be created
  }

  // Clear existing plans from local database
  await deleteAllPlans(db);

  // Set plan metadata
  const startDate = getNextMonday();
  await setPlanMetadata(db, "start_date", startDate);
  await setPlanMetadata(db, "total_weeks", String(totalWeeks));
  await setPlanMetadata(
    db,
    "plan_name",
    isExperienced ? "Building Fitness" : "New To Running",
  );

  let runsCreated = 0;
  const runsPerWeek = Math.min(availableDays.length, 3); // Max 3 runs per week for balance

  for (let week = 1; week <= totalWeeks; week++) {
    const weekStart = addDays(startDate, (week - 1) * 7);
    const weekWorkouts = generateWeekWorkouts(
      week,
      totalWeeks,
      availableDays.slice(0, runsPerWeek),
      isExperienced,
      weekStart,
    );

    for (const workout of weekWorkouts) {
      await insertPlan(db, workout);
      runsCreated++;
    }
  }

  return {
    success: true,
    runsCreated,
    totalWeeks,
    message: `Created ${totalWeeks}-week plan with ${runsCreated} workouts!`,
  };
}

// Generate workouts for a specific week
function generateWeekWorkouts(
  weekNum: number,
  totalWeeks: number,
  availableDays: string[],
  isExperienced: boolean,
  weekStartDate: string,
): TrainingPlan[] {
  const workouts: TrainingPlan[] = [];
  const progress = weekNum / totalWeeks; // 0 to 1

  // For beginners: Start with Walk-Run, progress to Easy runs
  // For experienced: Start with Easy, add longer runs
  for (let i = 0; i < availableDays.length; i++) {
    const day = availableDays[i];
    const scheduledDate = getDateForDayInWeek(weekStartDate, day);
    if (!scheduledDate) continue;

    let type: TrainingPlan["type"];
    let duration: number;
    let distance: number | null = null;
    let description: string;

    if (!isExperienced) {
      // Beginner progression: Walk-Run → Easy
      if (weekNum <= 3) {
        type = "Walk-Run";
        duration = 20 + (weekNum - 1) * 5; // 20, 25, 30 min
        description = `Walk-Run: ${duration} min (1 min run, 1 min walk)`;
      } else if (weekNum <= 6) {
        type = "Walk-Run";
        duration = 25 + (weekNum - 3) * 5; // 25, 30, 35 min
        description = `Walk-Run: ${duration} min (2 min run, 1 min walk)`;
      } else {
        type = "Easy";
        duration = 20 + (weekNum - 6) * 5;
        distance = Math.round((duration / 7) * 10) / 10; // ~7 min/km pace
        description = `Easy run: ${duration} min at conversational pace`;
      }
    } else {
      // Experienced: Easy runs with one longer run
      const isLongRun =
        i === availableDays.length - 1 && availableDays.length >= 2;

      if (isLongRun) {
        type = "Long";
        distance = 6 + Math.floor(weekNum / 2); // 6km, building to 12km
        duration = Math.round(distance * 6.5); // ~6:30/km pace
        description = `Long run: ${distance}km at easy pace`;
      } else {
        type = "Easy";
        distance = 4 + Math.floor(progress * 3); // 4-7km
        duration = Math.round(distance * 6);
        description = `Easy run: ${distance}km at conversational pace`;
      }
    }

    workouts.push({
      id: crypto.randomUUID(),
      scheduled_date: scheduledDate,
      week_number: weekNum,
      type,
      target_distance_km: distance,
      target_duration_minutes: duration,
      description,
      status: "Pending",
      google_event_id: null,
      garmin_workout_id: null,
    });
  }

  return workouts;
}

// Legacy function for backward compatibility
export async function generateWeeklyPlan(
  db: Database,
): Promise<{ success: boolean; runsCreated: number; message: string }> {
  const result = await generateFullPlan(db);
  return {
    success: result.success,
    runsCreated: result.runsCreated,
    message: result.message,
  };
}

// Helper: Get next Monday's date
function getNextMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  return nextMonday.toISOString().split("T")[0];
}

// Helper: Add days to a date string
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Helper: Get date for a specific day within a week starting from weekStart
function getDateForDayInWeek(
  weekStart: string,
  dayName: string,
): string | null {
  const dayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  const offset = dayMap[dayName];
  if (offset === undefined) return null;

  return addDays(weekStart, offset);
}

// Get the next occurrence of a day name (e.g., "Mon" -> "2026-01-05")
function getNextDateForDay(dayName: string): string | null {
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const targetDay = dayMap[dayName];
  if (targetDay === undefined) return null;

  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;

  // If the day has passed this week, get next week's
  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);

  return targetDate.toISOString().split("T")[0];
}
