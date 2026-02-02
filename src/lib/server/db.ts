// Database helpers for SQLite

import { getSQLiteDatabase, type LocalDatabase } from "./sqlite";

// Get database instance - for local deployment
export function getDb(): LocalDatabase {
  return getSQLiteDatabase();
}

export interface Run {
  user_id: string;
  garmin_activity_id: string;
  date: string;
  distance_meters: number;
  duration_seconds: number;
  avg_hr: number | null;
  max_hr: number | null;
  stress_score: number | null;
  ai_feedback: string | null;
  map_polyline: string | null;
  synced_to_calendar: boolean;
}

export interface TrainingGoal {
  id: string;
  user_id: string;
  name: string;
  goal_type: "distance" | "race" | "time_goal";
  target_date: string;
  target_distance_km: number | null;
  target_duration_minutes: number | null;
  description: string | null;
  status: "active" | "completed" | "abandoned";
  created_at: string;
  completed_at: string | null;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  scheduled_date: string;
  week_number: number;
  type: "Easy" | "Interval" | "Long" | "Rest" | "Walk-Run";
  target_distance_km: number | null;
  target_duration_minutes: number | null;
  description: string;
  status: "Pending" | "Completed" | "Missed" | "Rescheduled";
  google_event_id: string | null;
  garmin_workout_id: string | null;
  goal_id: string | null;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  context_type: "run" | "plan" | "general" | null;
  context_id: string | null;
}

export interface CoachAction {
  id: string;
  user_id: string;
  action_type: string;
  description: string;
  parameters: string | null;
  status: string;
  created_at: string;
  message_id: string | null;
}

export interface UserSetting {
  user_id: string;
  key: string;
  value: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  password_salt: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

// Settings keys
export const SETTING_KEYS = {
  // Garmin
  GARMIN_EMAIL: "garmin_email",
  GARMIN_PASSWORD: "garmin_password",
  // OpenRouter
  OPENROUTER_KEY: "openrouter_key",
  OPENROUTER_MODEL: "openrouter_model",
  // Goals
  TARGET_DATE: "target_date",
  AVAILABLE_DAYS: "available_days",
  CURRENT_FITNESS: "current_fitness",
  // Notifications
  NOTIFICATION_EMAIL: "notification_email",
  PUSH_ENABLED: "push_enabled",
  EMAIL_ENABLED: "email_enabled",
  NOTIFY_ON_SYNC: "notify_on_sync",
  NOTIFY_ON_MISSED: "notify_on_missed",
  // VAPID keys (generated once)
  VAPID_PUBLIC_KEY: "vapid_public_key",
  VAPID_PRIVATE_KEY: "vapid_private_key",
  // Demo mode (bypasses Garmin)
  DEMO_MODE: "demo_mode",
  // Plan generation
  PLAN_GENERATION_STRATEGY: "plan_generation_strategy",
  // Garmin OAuth tokens (persisted for automatic refresh)
  GARMIN_OAUTH1_TOKEN: "garmin_oauth1_token",
  GARMIN_OAUTH2_TOKEN: "garmin_oauth2_token",
} as const;

// Default model for OpenRouter
export const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

// Popular models available on OpenRouter
export const AVAILABLE_MODELS = [
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
  },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
  },
  {
    id: "mistralai/mistral-small-24b-instruct-2501",
    name: "Mistral Small",
    provider: "Mistral",
  },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek" },
] as const;

export type Database = LocalDatabase;

// =========== User & Session Functions ===========

export async function listUsers(db: Database): Promise<UserAccount[]> {
  const result = await db.prepare("SELECT * FROM users").all<UserAccount>();
  return result.results;
}

export async function getUserByEmail(
  db: Database,
  email: string,
): Promise<UserAccount | null> {
  return await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserAccount>();
}

export async function getUserById(
  db: Database,
  userId: string,
): Promise<UserAccount | null> {
  return await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserAccount>();
}

export async function createUser(
  db: Database,
  user: {
    id: string;
    email: string;
    name: string;
    password_hash: string | null;
    password_salt: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, password_salt)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.email.toLowerCase(),
      user.name,
      user.password_hash,
      user.password_salt,
    )
    .run();
}

export async function updateUser(
  db: Database,
  userId: string,
  updates: Partial<Pick<UserAccount, "email" | "name" | "password_hash" | "password_salt">>,
): Promise<void> {
  const fields: string[] = [];
  const values: string[] = [];

  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email.toLowerCase());
  }
  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.password_hash !== undefined) {
    fields.push("password_hash = ?");
    values.push(updates.password_hash ?? "");
  }
  if (updates.password_salt !== undefined) {
    fields.push("password_salt = ?");
    values.push(updates.password_salt ?? "");
  }

  if (fields.length === 0) return;

  values.push(userId);
  await db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function createSession(
  db: Database,
  session: { id: string; user_id: string; expires_at: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(session.id, session.user_id, session.expires_at)
    .run();
}

export async function getSessionById(
  db: Database,
  sessionId: string,
): Promise<Session | null> {
  return await db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<Session>();
}

export async function deleteSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id = ?")
    .bind(sessionId)
    .run();
}

export async function deleteSessionsForUser(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE user_id = ?")
    .bind(userId)
    .run();
}

// Get a single setting
export async function getSetting(
  db: Database,
  userId: string,
  key: string,
): Promise<string | null> {
  const result = await db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
    .bind(userId, key)
    .first<{ value: string }>();
  return result?.value ?? null;
}

// Get multiple settings
export async function getSettings(
  db: Database,
  userId: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  const placeholders = keys.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT key, value FROM user_settings WHERE user_id = ? AND key IN (${placeholders})`,
    )
    .bind(userId, ...keys)
    .all<UserSetting>();

  const settings: Record<string, string | null> = {};
  for (const key of keys) {
    const found = result.results.find((r) => r.key === key);
    settings[key] = found?.value ?? null;
  }
  return settings;
}

// Set a setting (upsert)
export async function setSetting(
  db: Database,
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    )
    .bind(userId, key, value)
    .run();
}

// Set multiple settings
export async function setSettings(
  db: Database,
  userId: string,
  settings: Record<string, string>,
): Promise<void> {
  const statements = Object.entries(settings).map(([key, value]) =>
    db
      .prepare(
        "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
      )
      .bind(userId, key, value),
  );
  await db.batch(statements);
}

// Get runs after a certain date
export async function getRunsAfterDate(
  db: Database,
  userId: string,
  fromDate: string,
): Promise<Run[]> {
  const result = await db
    .prepare(
      "SELECT * FROM runs WHERE user_id = ? AND date >= ? ORDER BY date ASC",
    )
    .bind(userId, fromDate)
    .all<Run>();
  return result.results;
}

// Get recent runs
export async function getRecentRuns(
  db: Database,
  userId: string,
  limit = 10,
): Promise<Run[]> {
  const result = await db
    .prepare(
      "SELECT * FROM runs WHERE user_id = ? ORDER BY date DESC LIMIT ?",
    )
    .bind(userId, limit)
    .all<Run>();
  return result.results;
}

// Get a run by Garmin activity ID
export async function getRunByActivityId(
  db: Database,
  userId: string,
  activityId: string,
): Promise<Run | null> {
  return await db
    .prepare(
      "SELECT * FROM runs WHERE user_id = ? AND garmin_activity_id = ?",
    )
    .bind(userId, activityId)
    .first<Run>();
}

// Insert a new run
export async function insertRun(
  db: Database,
  userId: string,
  run: Omit<Run, "synced_to_calendar" | "user_id">,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (user_id, garmin_activity_id, date, distance_meters, duration_seconds, avg_hr, max_hr, stress_score, ai_feedback, map_polyline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      run.garmin_activity_id,
      run.date,
      run.distance_meters,
      run.duration_seconds,
      run.avg_hr,
      run.max_hr,
      run.stress_score,
      run.ai_feedback,
      run.map_polyline,
    )
    .run();
}

// Update AI feedback for a run
export async function updateRunFeedback(
  db: Database,
  userId: string,
  activityId: string,
  feedback: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE runs SET ai_feedback = ? WHERE user_id = ? AND garmin_activity_id = ?",
    )
    .bind(feedback, userId, activityId)
    .run();
}

// Update polyline for a run
export async function updateRunPolyline(
  db: Database,
  userId: string,
  activityId: string,
  polyline: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE runs SET map_polyline = ? WHERE user_id = ? AND garmin_activity_id = ?",
    )
    .bind(polyline, userId, activityId)
    .run();
}

// Get all existing activity IDs (for deduplication)
export async function getExistingActivityIds(
  db: Database,
  userId: string,
): Promise<Set<string>> {
  const result = await db
    .prepare("SELECT garmin_activity_id FROM runs WHERE user_id = ?")
    .bind(userId)
    .all<{ garmin_activity_id: string }>();
  return new Set(result.results.map((r) => r.garmin_activity_id));
}

// Calculate consistency stats (runs per week for the last N weeks)
export async function getConsistencyStats(
  db: Database,
  userId: string,
  weeks = 8,
): Promise<{ week: string; count: number }[]> {
  const result = await db
    .prepare(
      `SELECT strftime('%Y-%W', date) as week, COUNT(*) as count
       FROM runs
       WHERE user_id = ? AND date >= date('now', '-${weeks * 7} days')
       GROUP BY week
       ORDER BY week DESC`,
    )
    .bind(userId)
    .all<{ week: string; count: number }>();
  return result.results;
}

// Check if Garmin credentials are available (from env or DB)
export async function getGarminCredentials(
  db: Database,
  userId: string,
): Promise<{ email: string; password: string } | null> {
  // Check environment variables first
  const envEmail = process.env.GARMIN_EMAIL;
  const envPassword = process.env.GARMIN_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }

  // Fall back to database
  const dbEmail = await getSetting(db, userId, SETTING_KEYS.GARMIN_EMAIL);
  const dbPassword = await getSetting(db, userId, SETTING_KEYS.GARMIN_PASSWORD);
  if (dbEmail && dbPassword) {
    return { email: dbEmail, password: dbPassword };
  }

  return null;
}

// Check if Garmin credentials come from env vars (immutable)
export function hasEnvGarminCredentials(): boolean {
  return !!(process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD);
}

// Check if user has completed setup (just needs Garmin and goals)
export async function hasCompletedSetup(
  db: Database,
  userId: string,
): Promise<boolean> {
  // Check env vars first for Garmin
  const hasEnvGarmin = hasEnvGarminCredentials();
  const garminEmail = hasEnvGarmin
    ? process.env.GARMIN_EMAIL
    : await getSetting(db, userId, SETTING_KEYS.GARMIN_EMAIL);

  const availableDays = await getSetting(
    db,
    userId,
    SETTING_KEYS.AVAILABLE_DAYS,
  );
  const goals = await getActiveGoals(db, userId);
  return !!(garminEmail && availableDays && goals.length > 0);
}

// =========== Training Plan Functions ===========

// Get upcoming planned runs for this week only (next 7 days)
export async function getUpcomingPlans(
  db: Database,
  userId: string,
  limit = 7,
): Promise<TrainingPlan[]> {
  const result = await db
    .prepare(
      `SELECT * FROM training_plan
			 WHERE user_id = ?
			   AND scheduled_date >= date('now')
			   AND scheduled_date <= date('now', '+7 days')
			   AND status = 'Pending'
			 ORDER BY scheduled_date ASC
			 LIMIT ?`,
    )
    .bind(userId, limit)
    .all<TrainingPlan>();
  return result.results;
}

// Get all plans for a date range
export async function getPlansForRange(
  db: Database,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<TrainingPlan[]> {
  const result = await db
    .prepare(
      `SELECT * FROM training_plan
			 WHERE user_id = ? AND scheduled_date >= ? AND scheduled_date <= ?
			 ORDER BY scheduled_date ASC`,
    )
    .bind(userId, startDate, endDate)
    .all<TrainingPlan>();
  return result.results;
}

// Insert a new training plan
export async function insertPlan(
  db: Database,
  plan: TrainingPlan,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO training_plan (id, user_id, scheduled_date, week_number, type, target_distance_km, target_duration_minutes, description, status, google_event_id, garmin_workout_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      plan.id,
      plan.user_id,
      plan.scheduled_date,
      plan.week_number,
      plan.type,
      plan.target_distance_km,
      plan.target_duration_minutes,
      plan.description,
      plan.status,
      plan.google_event_id,
      plan.garmin_workout_id,
    )
    .run();
}

// Get all plans grouped by week
export async function getPlansGroupedByWeek(
  db: Database,
  userId: string,
): Promise<Map<number, TrainingPlan[]>> {
  const result = await db
    .prepare(
      `SELECT * FROM training_plan WHERE user_id = ? AND status = 'Pending' ORDER BY week_number, scheduled_date`,
    )
    .bind(userId)
    .all<TrainingPlan>();

  const grouped = new Map<number, TrainingPlan[]>();
  for (const plan of result.results) {
    const week = plan.week_number || 1;
    if (!grouped.has(week)) {
      grouped.set(week, []);
    }
    grouped.get(week)!.push(plan);
  }
  return grouped;
}

// Get plan metadata
export async function getPlanMetadata(
  db: Database,
  userId: string,
): Promise<Record<string, string | null>> {
  const result = await db
    .prepare("SELECT key, value FROM plan_metadata WHERE user_id = ?")
    .bind(userId)
    .all<{ key: string; value: string }>();

  const metadata: Record<string, string | null> = {};
  for (const row of result.results) {
    metadata[row.key] = row.value;
  }
  return metadata;
}

// Set plan metadata
export async function setPlanMetadata(
  db: Database,
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO plan_metadata (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    )
    .bind(userId, key, value)
    .run();
}

// Delete all plans (for regenerating full plan)
// NOTE: Only deletes pending plans to preserve historical data (Completed/Missed workouts)
export async function deleteAllPlans(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM training_plan WHERE user_id = ? AND status = 'Pending'",
    )
    .bind(userId)
    .run();
  await db
    .prepare("DELETE FROM plan_metadata WHERE user_id = ?")
    .bind(userId)
    .run();
}

// Get current week number based on plan start date
export async function getCurrentWeekNumber(
  db: Database,
  userId: string,
): Promise<number> {
  const metadata = await getPlanMetadata(db, userId);
  const startDate = metadata["start_date"];
  if (!startDate) return 1;

  const start = new Date(startDate);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// Update plan status
export async function updatePlanStatus(
  db: Database,
  userId: string,
  planId: string,
  status: TrainingPlan["status"],
): Promise<void> {
  await db
    .prepare("UPDATE training_plan SET status = ? WHERE user_id = ? AND id = ?")
    .bind(status, userId, planId)
    .run();
}

// Update Garmin workout ID after syncing to watch
export async function updatePlanGarminId(
  db: Database,
  userId: string,
  planId: string,
  garminWorkoutId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE training_plan SET garmin_workout_id = ? WHERE user_id = ? AND id = ?",
    )
    .bind(garminWorkoutId, userId, planId)
    .run();
}

// Clear all Garmin workout IDs (after deleting from Garmin)
// NOTE: Only clears IDs for pending workouts to preserve historical data
export async function clearAllGarminWorkoutIds(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE training_plan SET garmin_workout_id = NULL WHERE user_id = ? AND status = 'Pending'",
    )
    .bind(userId)
    .run();
}

// Delete future pending plans (for regenerating)
export async function deleteFuturePlans(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM training_plan WHERE user_id = ? AND scheduled_date >= date('now') AND status = 'Pending'`,
    )
    .bind(userId)
    .run();
}

// Smart run matching: Find nearest pending plan for a completed run and mark it complete
export async function matchRunToPlan(
  db: Database,
  userId: string,
  runDate: string,
): Promise<boolean> {
  // Parse run date (format: "2026-01-08 12:34:45" or "2026-01-08")
  const runDateOnly = runDate.split(" ")[0]; // Get just YYYY-MM-DD
  const runTimestamp = new Date(runDateOnly).getTime();

  // Find all pending non-Rest plans within +/- 4 days of the run
  const nearbyPlans = await db
    .prepare(
      `SELECT id, scheduled_date, type
			 FROM training_plan
			 WHERE user_id = ?
			   AND status = 'Pending'
			   AND type != 'Rest'
			   AND scheduled_date BETWEEN date(?, '-4 days') AND date(?, '+4 days')
			 ORDER BY scheduled_date`,
    )
    .bind(userId, runDateOnly, runDateOnly)
    .all<{ id: string; scheduled_date: string; type: string }>();

  if (nearbyPlans.results.length === 0) {
    return false; // No nearby plans to match
  }

  // Find the closest plan by date difference
  let closestPlan: { id: string; scheduled_date: string; type: string } | null =
    null;
  let smallestDiff = Infinity;

  for (const plan of nearbyPlans.results) {
    const planTimestamp = new Date(plan.scheduled_date).getTime();
    const diff = Math.abs(runTimestamp - planTimestamp);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestPlan = plan;
    }
  }

  if (closestPlan) {
    // Mark the closest plan as completed
    await updatePlanStatus(db, userId, closestPlan.id, "Completed");
    console.log(
      `✓ Matched run from ${runDateOnly} to plan on ${closestPlan.scheduled_date}`,
    );
    return true;
  }

  return false;
}

// Get the next scheduled run
export async function getNextRun(
  db: Database,
  userId: string,
): Promise<TrainingPlan | null> {
  return await db
    .prepare(
      `SELECT * FROM training_plan
			 WHERE user_id = ? AND scheduled_date >= date('now') AND status = 'Pending'
			 ORDER BY scheduled_date ASC
			 LIMIT 1`,
    )
    .bind(userId)
    .first<TrainingPlan>();
}

// Push subscription management
export async function savePushSubscription(
  db: Database,
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(
      id,
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
    )
    .run();
}

export async function getPushSubscriptions(
  db: Database,
  userId: string,
): Promise<PushSubscription[]> {
  const result = await db
    .prepare("SELECT * FROM push_subscriptions WHERE user_id = ?")
    .bind(userId)
    .all<PushSubscription>();
  return result.results;
}

export async function deletePushSubscription(
  db: Database,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .bind(userId, endpoint)
    .run();
}

// =========== Chat System Functions ===========

// Insert a chat message
export async function insertChatMessage(
  db: Database,
  userId: string,
  message: ChatMessage,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_messages (id, user_id, role, content, created_at, context_type, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      message.id,
      userId,
      message.role,
      message.content,
      message.created_at,
      message.context_type,
      message.context_id,
    )
    .run();
}

// Get chat history
export async function getChatHistory(
  db: Database,
  userId: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const result = await db
    .prepare(
      "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?",
    ) // Show oldest to newest
    .bind(userId, limit)
    .all<ChatMessage>();
  return result.results;
}

// Insert a coach action log
export async function insertCoachAction(
  db: Database,
  userId: string,
  action: CoachAction,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO coach_actions (id, user_id, action_type, description, parameters, status, created_at, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      action.id,
      userId,
      action.action_type,
      action.description,
      action.parameters,
      action.status,
      action.created_at,
      action.message_id,
    )
    .run();
}

// =========== Additional Tool Helpers ===========

// Get workout by date
export async function getWorkoutByDate(
  db: Database,
  userId: string,
  date: string,
): Promise<TrainingPlan | null> {
  return await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date = ?",
    )
    .bind(userId, date)
    .first<TrainingPlan>();
}

// Get workouts in date range
export async function getWorkoutsInRange(
  db: Database,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<TrainingPlan[]> {
  const result = await db
    .prepare(
      "SELECT * FROM training_plan WHERE user_id = ? AND scheduled_date BETWEEN ? AND ? ORDER BY scheduled_date",
    )
    .bind(userId, startDate, endDate)
    .all<TrainingPlan>();
  return result.results;
}

// Delete a single workout
export async function deleteWorkout(
  db: Database,
  userId: string,
  planId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM training_plan WHERE user_id = ? AND id = ?")
    .bind(userId, planId)
    .run();
}

// Get run by date (for matching)
export async function getRunByDate(
  db: Database,
  userId: string,
  date: string,
): Promise<Run | null> {
  return await db
    .prepare("SELECT * FROM runs WHERE user_id = ? AND date(date) = ?")
    .bind(userId, date)
    .first<Run>();
}

// Delete a run
export async function deleteRun(
  db: Database,
  userId: string,
  activityId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM runs WHERE user_id = ? AND garmin_activity_id = ?")
    .bind(userId, activityId)
    .run();
}

// ============= TRAINING GOALS =============

// Create a new training goal
export async function createGoal(
  db: Database,
  userId: string,
  goal: Omit<TrainingGoal, "id" | "created_at" | "completed_at" | "user_id">,
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO training_goals (id, user_id, name, goal_type, target_date, target_distance_km, target_duration_minutes, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      goal.name,
      goal.goal_type,
      goal.target_date,
      goal.target_distance_km,
      goal.target_duration_minutes,
      goal.description,
      goal.status,
    )
    .run();
  return id;
}

// Get all active goals
export async function getActiveGoals(
  db: Database,
  userId: string,
): Promise<TrainingGoal[]> {
  const result = await db
    .prepare(
      "SELECT * FROM training_goals WHERE user_id = ? AND status = 'active' ORDER BY target_date ASC",
    )
    .bind(userId)
    .all<TrainingGoal>();
  return result.results;
}

// Get goal by ID
export async function getGoalById(
  db: Database,
  userId: string,
  id: string,
): Promise<TrainingGoal | null> {
  return await db
    .prepare("SELECT * FROM training_goals WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<TrainingGoal>();
}

// Update goal
export async function updateGoal(
  db: Database,
  userId: string,
  id: string,
  updates: Partial<TrainingGoal>,
): Promise<void> {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.target_date !== undefined) {
    fields.push("target_date = ?");
    values.push(updates.target_date);
  }
  if (updates.target_distance_km !== undefined) {
    fields.push("target_distance_km = ?");
    values.push(updates.target_distance_km);
  }
  if (updates.target_duration_minutes !== undefined) {
    fields.push("target_duration_minutes = ?");
    values.push(updates.target_duration_minutes);
  }
  if (updates.goal_type !== undefined) {
    fields.push("goal_type = ?");
    values.push(updates.goal_type);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length > 0) {
    values.push(userId, id);
    await db
      .prepare(
        `UPDATE training_goals SET ${fields.join(", ")} WHERE user_id = ? AND id = ?`,
      )
      .bind(...values)
      .run();
  }
}

// Delete goal
export async function deleteGoal(
  db: Database,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM training_goals WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .run();
}

// Get all completed/missed workouts for display (historical data)
export async function getHistoricalWorkouts(
  db: Database,
  userId: string,
  goalId?: string,
): Promise<TrainingPlan[]> {
  const query = goalId
    ? "SELECT * FROM training_plan WHERE user_id = ? AND goal_id = ? AND status IN ('Completed', 'Missed') ORDER BY scheduled_date"
    : "SELECT * FROM training_plan WHERE user_id = ? AND status IN ('Completed', 'Missed') ORDER BY scheduled_date";

  const params = goalId ? [userId, goalId] : [userId];
  return await db.prepare(query).bind(...params).all<TrainingPlan>();
}
