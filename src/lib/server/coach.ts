// AI Coach service using OpenRouter
import {
  getSetting,
  getSettings,
  SETTING_KEYS,
  DEFAULT_MODEL,
  insertPlan,
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
  getChatSystemPrompt,
  DEFAULT_FEEDBACK_MESSAGES,
} from "$lib/prompts";
import { PLAN_TOOLS, executePlanTool, type ToolDefinition } from "./tools";
import { insertChatMessage, getChatHistory, type ChatMessage } from "./db";
import { parseAvailableDays } from "$lib/days";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Simple message type for OpenRouter API (without DB fields)
interface ApiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
  }[];
}

// Call OpenRouter API
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: ApiMessage[],
  tools?: ToolDefinition[], // Add tools support
  maxTokens = 500, // Increased for tool calls
): Promise<{ content: string; toolCalls?: any[] }> {
  const body: any = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.9, // Higher creativity for varied, specific responses
  };

  if (tools) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: t,
    }));
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://opencoach.run",
      "X-Title": "OpenCoach",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const choice = data.choices[0]?.message;

  return {
    content: choice?.content || "",
    toolCalls: choice?.tool_calls,
  };
}

import type { LocalDatabase } from "./sqlite";

type Database = LocalDatabase;

// Get configured model or default
async function getModel(db: Database, userId: string): Promise<string> {
  const model = await getSetting(db, userId, SETTING_KEYS.OPENROUTER_MODEL);
  return model || DEFAULT_MODEL;
}

// Get OpenRouter credentials from env or DB
async function getOpenRouterCredentials(
  db: Database,
  userId: string,
): Promise<{ apiKey: string | null; model: string }> {
  // Prefer environment variables
  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    };
  }

  // Fall back to DB settings
  const settings = await getSettings(db, userId, [
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
  userId: string,
  run: Omit<Run, "ai_feedback" | "synced_to_calendar" | "user_id">,
): Promise<string> {
  const { apiKey, model } = await getOpenRouterCredentials(db, userId);

  // Get run count for milestones
  const recentRuns = await getRecentRuns(db, userId, 100);
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
    const response = await callOpenRouter(apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    return celebrationPrefix + response.content;
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
      undefined, // no tools
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
  userId: string,
): Promise<{
  success: boolean;
  runsCreated: number;
  totalWeeks: number;
  message: string;
}> {
  // Get user's settings
  const settings = await getSettings(db, userId, [
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

  const availableDays = parseAvailableDays(availableDaysJson, { sort: true });

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
  return generateStructuredPlan(db, userId, availableDays, totalWeeks, isComplete);
}

// Generate a structured multi-week plan (Runna-style)
async function generateStructuredPlan(
  db: Database,
  userId: string,
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
    const deleteResult = await deleteAllOpenCoachWorkouts(db, userId);
    console.log(`Deleted ${deleteResult.deleted} old workouts from Garmin`);
  } catch (err) {
    console.warn("Could not delete old Garmin workouts:", err);
    // Continue anyway - workouts will still be created
  }

  // Clear existing plans from local database
  await deleteAllPlans(db, userId);

  // Set plan metadata
  const startDate = getNextMonday();
  await setPlanMetadata(db, userId, "start_date", startDate);
  await setPlanMetadata(db, userId, "total_weeks", String(totalWeeks));
  await setPlanMetadata(
    db,
    userId,
    "plan_name",
    isExperienced ? "Building Fitness" : "New To Running",
  );

  let runsCreated = 0;
  const runsPerWeek = Math.min(availableDays.length, 3); // Max 3 runs per week for balance

  for (let week = 1; week <= totalWeeks; week++) {
    const weekStart = addDays(startDate, (week - 1) * 7);
    const weekWorkouts = generateWeekWorkouts(
      userId,
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
  userId: string,
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
      user_id: userId,
      scheduled_date: scheduledDate,
      week_number: weekNum,
      type,
      target_distance_km: distance,
      target_duration_minutes: duration,
      description,
      status: "Pending",
      goal_id: null, // Legacy plans don't have a specific goal
      google_event_id: null,
      garmin_workout_id: null,
    });
  }

  return workouts;
}

// Legacy function for backward compatibility
export async function generateWeeklyPlan(
  db: Database,
  userId: string,
): Promise<{ success: boolean; runsCreated: number; message: string }> {
  const result = await generateFullPlan(db, userId);
  return {
    success: result.success,
    runsCreated: result.runsCreated,
    message: result.message,
  };
}

// Helper: Get this week's Monday (or next Monday if today is Sunday)
function getNextMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const monday = new Date(today);
  
  if (dayOfWeek === 0) {
    // Sunday - start next week (tomorrow)
    monday.setDate(today.getDate() + 1);
  } else {
    // Mon-Sat - go back to this week's Monday
    monday.setDate(today.getDate() - (dayOfWeek - 1));
  }
  
  return monday.toISOString().split("T")[0];
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

// =========== Chat Processing ===========

export async function processUserMessage(
  db: Database,
  userId: string,
  userContent: string,
): Promise<string> {
  const { apiKey, model } = await getOpenRouterCredentials(db, userId);
  if (!apiKey) {
    return "I need an OpenRouter API key to chat. Please check your settings.";
  }

  // 1. Save user message
  const userMsgId = crypto.randomUUID();
  await insertChatMessage(db, userId, {
    id: userMsgId,
    role: "user",
    content: userContent,
    created_at: new Date().toISOString(),
    context_type: "general",
    context_id: null,
  });

  // 2. Get context (recent history + plan context)
  const history = await getChatHistory(db, userId, 10);
  const messages: ApiMessage[] = history.map((h) => ({
    role: h.role as "user" | "assistant" | "system",
    content: h.content,
  }));

  // Add system prompt with context
  // We could make this smarter by pulling specific plan details if asked
  const systemPrompt = getChatSystemPrompt(
    "User is asking for help with their training.",
  );
  messages.unshift({ role: "system", content: systemPrompt });

  // 3. Call AI with Tools
  try {
    const response = await callOpenRouter(apiKey, model, messages, PLAN_TOOLS);

    let finalContent = response.content;

    // 4. Handle Tool Calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Add assistant message with tool calls to history (required by API usually, but for local history we just store the text intent if content exists)
      // For the API conversation flow, we need to append the tool calls.
      // For our simplified storage, we'll store the "Thought" as the assistant message if it exists.

      for (const toolCall of response.toolCalls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        console.log(`[Coach] Executing tool: ${toolName}`, args);

        const toolResult = await executePlanTool(
          db,
          userId,
          toolName,
          args,
          userMsgId,
        );

        // Add tool result to the conversation for the final response
        messages.push({
          role: "assistant", // This should technically be the tool_calls message, but simplifying for now
          content: response.content || "I am processing your request...",
        });

        // We need to send the tool output back to the model to get the final natural language response
        messages.push({
          role: "user", // Representing the system/tool output as a user message for simplicity with some models, or properly as 'tool' if supporting strictly
          content: `Tool '${toolName}' Output: ${toolResult.message}`,
        });
      }

      // Get final response after tools
      const finalResponse = await callOpenRouter(apiKey, model, messages);
      finalContent = finalResponse.content;
    }

    // 5. Save Assistant Response
    if (finalContent) {
      await insertChatMessage(db, userId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        created_at: new Date().toISOString(),
        context_type: "general",
        context_id: null,
      });
    }

    return finalContent || "I processed that, but I'm not sure what to say.";
  } catch (error: any) {
    console.error("Chat Error:", error);
    return "I'm having trouble connecting to my brain right now. Please try again.";
  }
}
