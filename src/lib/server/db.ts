// Database helpers for SQLite

import { getSQLiteDatabase, type LocalDatabase } from './sqlite';

// Get database instance - for local deployment
export function getDb(): LocalDatabase {
	return getSQLiteDatabase();
}

export interface Run {
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

export interface TrainingPlan {
	id: string;
	scheduled_date: string;
	week_number: number;
	type: 'Easy' | 'Interval' | 'Long' | 'Rest' | 'Walk-Run';
	target_distance_km: number | null;
	target_duration_minutes: number | null;
	description: string;
	status: 'Pending' | 'Completed' | 'Missed' | 'Rescheduled';
	google_event_id: string | null;
	garmin_workout_id: string | null;
}

export interface PushSubscription {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	created_at: string;
}

export interface UserSetting {
	key: string;
	value: string;
}

// Settings keys
export const SETTING_KEYS = {
	// Garmin
	GARMIN_EMAIL: 'garmin_email',
	GARMIN_PASSWORD: 'garmin_password',
	// OpenRouter
	OPENROUTER_KEY: 'openrouter_key',
	OPENROUTER_MODEL: 'openrouter_model',
	// Goals
	TARGET_DATE: 'target_date',
	AVAILABLE_DAYS: 'available_days',
	CURRENT_FITNESS: 'current_fitness',
	// Notifications
	NOTIFICATION_EMAIL: 'notification_email',
	PUSH_ENABLED: 'push_enabled',
	EMAIL_ENABLED: 'email_enabled',
	NOTIFY_ON_SYNC: 'notify_on_sync',
	NOTIFY_ON_MISSED: 'notify_on_missed',
	// VAPID keys (generated once)
	VAPID_PUBLIC_KEY: 'vapid_public_key',
	VAPID_PRIVATE_KEY: 'vapid_private_key',
	// Demo mode (bypasses Garmin)
	DEMO_MODE: 'demo_mode',
	// Garmin OAuth tokens (persisted for automatic refresh)
	GARMIN_OAUTH1_TOKEN: 'garmin_oauth1_token',
	GARMIN_OAUTH2_TOKEN: 'garmin_oauth2_token'
} as const;

// Default model for OpenRouter
export const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku';

// Popular models available on OpenRouter
export const AVAILABLE_MODELS = [
	{ id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
	{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
	{ id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
	{ id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
	{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google' },
	{ id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta' },
	{ id: 'mistralai/mistral-small-24b-instruct-2501', name: 'Mistral Small', provider: 'Mistral' },
	{ id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' }
] as const;

type Database = LocalDatabase;

// Get a single setting
export async function getSetting(db: Database, key: string): Promise<string | null> {
	const result = await db
		.prepare('SELECT value FROM user_settings WHERE key = ?')
		.bind(key)
		.first<{ value: string }>();
	return result?.value ?? null;
}

// Get multiple settings
export async function getSettings(
	db: Database,
	keys: string[]
): Promise<Record<string, string | null>> {
	const placeholders = keys.map(() => '?').join(',');
	const result = await db
		.prepare(`SELECT key, value FROM user_settings WHERE key IN (${placeholders})`)
		.bind(...keys)
		.all<UserSetting>();

	const settings: Record<string, string | null> = {};
	for (const key of keys) {
		const found = result.results.find((r) => r.key === key);
		settings[key] = found?.value ?? null;
	}
	return settings;
}

// Set a setting (upsert)
export async function setSetting(db: Database, key: string, value: string): Promise<void> {
	await db
		.prepare(
			'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		)
		.bind(key, value)
		.run();
}

// Set multiple settings
export async function setSettings(
	db: Database,
	settings: Record<string, string>
): Promise<void> {
	const statements = Object.entries(settings).map(([key, value]) =>
		db
			.prepare(
				'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
			)
			.bind(key, value)
	);
	await db.batch(statements);
}

// Get recent runs
export async function getRecentRuns(db: Database, limit = 10): Promise<Run[]> {
	const result = await db
		.prepare('SELECT * FROM runs ORDER BY date DESC LIMIT ?')
		.bind(limit)
		.all<Run>();
	return result.results;
}

// Get a run by Garmin activity ID
export async function getRunByActivityId(
	db: Database,
	activityId: string
): Promise<Run | null> {
	return await db
		.prepare('SELECT * FROM runs WHERE garmin_activity_id = ?')
		.bind(activityId)
		.first<Run>();
}

// Insert a new run
export async function insertRun(db: Database, run: Omit<Run, 'synced_to_calendar'>): Promise<void> {
	await db
		.prepare(
			`INSERT INTO runs (garmin_activity_id, date, distance_meters, duration_seconds, avg_hr, max_hr, stress_score, ai_feedback, map_polyline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			run.garmin_activity_id,
			run.date,
			run.distance_meters,
			run.duration_seconds,
			run.avg_hr,
			run.max_hr,
			run.stress_score,
			run.ai_feedback,
			run.map_polyline
		)
		.run();
}

// Update AI feedback for a run
export async function updateRunFeedback(
	db: Database,
	activityId: string,
	feedback: string
): Promise<void> {
	await db
		.prepare('UPDATE runs SET ai_feedback = ? WHERE garmin_activity_id = ?')
		.bind(feedback, activityId)
		.run();
}

// Get all existing activity IDs (for deduplication)
export async function getExistingActivityIds(db: Database): Promise<Set<string>> {
	const result = await db
		.prepare('SELECT garmin_activity_id FROM runs')
		.all<{ garmin_activity_id: string }>();
	return new Set(result.results.map((r) => r.garmin_activity_id));
}

// Calculate consistency stats (runs per week for the last N weeks)
export async function getConsistencyStats(
	db: Database,
	weeks = 8
): Promise<{ week: string; count: number }[]> {
	const result = await db
		.prepare(
			`SELECT strftime('%Y-%W', date) as week, COUNT(*) as count
       FROM runs
       WHERE date >= date('now', '-${weeks * 7} days')
       GROUP BY week
       ORDER BY week DESC`
		)
		.all<{ week: string; count: number }>();
	return result.results;
}

// Check if Garmin credentials are available (from env or DB)
export async function getGarminCredentials(db: Database): Promise<{ email: string; password: string } | null> {
	// Check environment variables first
	const envEmail = process.env.GARMIN_EMAIL;
	const envPassword = process.env.GARMIN_PASSWORD;
	if (envEmail && envPassword) {
		return { email: envEmail, password: envPassword };
	}

	// Fall back to database
	const dbEmail = await getSetting(db, SETTING_KEYS.GARMIN_EMAIL);
	const dbPassword = await getSetting(db, SETTING_KEYS.GARMIN_PASSWORD);
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
export async function hasCompletedSetup(db: Database): Promise<boolean> {
	// Check env vars first for Garmin
	const hasEnvGarmin = hasEnvGarminCredentials();
	const garminEmail = hasEnvGarmin ? process.env.GARMIN_EMAIL : await getSetting(db, SETTING_KEYS.GARMIN_EMAIL);
	
	const targetDate = await getSetting(db, SETTING_KEYS.TARGET_DATE);
	const availableDays = await getSetting(db, SETTING_KEYS.AVAILABLE_DAYS);
	return !!(garminEmail && targetDate && availableDays);
}

// =========== Training Plan Functions ===========

// Get upcoming planned runs for this week only (next 7 days)
export async function getUpcomingPlans(db: Database, _limit = 7): Promise<TrainingPlan[]> {
	const result = await db
		.prepare(
			`SELECT * FROM training_plan 
			 WHERE scheduled_date >= date('now') 
			   AND scheduled_date <= date('now', '+7 days')
			   AND status = 'Pending'
			 ORDER BY scheduled_date ASC`
		)
		.all<TrainingPlan>();
	return result.results;
}

// Get all plans for a date range
export async function getPlansForRange(
	db: Database,
	startDate: string,
	endDate: string
): Promise<TrainingPlan[]> {
	const result = await db
		.prepare(
			`SELECT * FROM training_plan 
			 WHERE scheduled_date >= ? AND scheduled_date <= ?
			 ORDER BY scheduled_date ASC`
		)
		.bind(startDate, endDate)
		.all<TrainingPlan>();
	return result.results;
}

// Insert a new training plan
export async function insertPlan(db: Database, plan: TrainingPlan): Promise<void> {
	await db
		.prepare(
			`INSERT INTO training_plan (id, scheduled_date, week_number, type, target_distance_km, target_duration_minutes, description, status, google_event_id, garmin_workout_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			plan.id,
			plan.scheduled_date,
			plan.week_number,
			plan.type,
			plan.target_distance_km,
			plan.target_duration_minutes,
			plan.description,
			plan.status,
			plan.google_event_id,
			plan.garmin_workout_id
		)
		.run();
}

// Get all plans grouped by week
export async function getPlansGroupedByWeek(db: Database): Promise<Map<number, TrainingPlan[]>> {
	const result = await db
		.prepare(`SELECT * FROM training_plan WHERE status = 'Pending' ORDER BY week_number, scheduled_date`)
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
export async function getPlanMetadata(db: Database): Promise<Record<string, string | null>> {
	const result = await db
		.prepare('SELECT key, value FROM plan_metadata')
		.all<{ key: string; value: string }>();

	const metadata: Record<string, string | null> = {};
	for (const row of result.results) {
		metadata[row.key] = row.value;
	}
	return metadata;
}

// Set plan metadata
export async function setPlanMetadata(db: Database, key: string, value: string): Promise<void> {
	await db
		.prepare('INSERT INTO plan_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		.bind(key, value)
		.run();
}

// Delete all plans (for regenerating full plan)
export async function deleteAllPlans(db: Database): Promise<void> {
	await db.prepare('DELETE FROM training_plan').run();
	await db.prepare('DELETE FROM plan_metadata').run();
}

// Get current week number based on plan start date
export async function getCurrentWeekNumber(db: Database): Promise<number> {
	const metadata = await getPlanMetadata(db);
	const startDate = metadata['start_date'];
	if (!startDate) return 1;

	const start = new Date(startDate);
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
	return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// Update plan status
export async function updatePlanStatus(
	db: Database,
	planId: string,
	status: TrainingPlan['status']
): Promise<void> {
	await db
		.prepare('UPDATE training_plan SET status = ? WHERE id = ?')
		.bind(status, planId)
		.run();
}

// Update Garmin workout ID after syncing to watch
export async function updatePlanGarminId(
	db: Database,
	planId: string,
	garminWorkoutId: string
): Promise<void> {
	await db
		.prepare('UPDATE training_plan SET garmin_workout_id = ? WHERE id = ?')
		.bind(garminWorkoutId, planId)
		.run();
}

// Clear all Garmin workout IDs (after deleting from Garmin)
export async function clearAllGarminWorkoutIds(db: Database): Promise<void> {
	await db
		.prepare('UPDATE training_plan SET garmin_workout_id = NULL')
		.run();
}

// Delete future pending plans (for regenerating)
export async function deleteFuturePlans(db: Database): Promise<void> {
	await db
		.prepare(`DELETE FROM training_plan WHERE scheduled_date >= date('now') AND status = 'Pending'`)
		.run();
}

// Smart run matching: Find nearest pending plan for a completed run and mark it complete
export async function matchRunToPlan(db: Database, runDate: string): Promise<boolean> {
	// Parse run date (format: "2026-01-08 12:34:45" or "2026-01-08")
	const runDateOnly = runDate.split(' ')[0]; // Get just YYYY-MM-DD
	const runTimestamp = new Date(runDateOnly).getTime();

	// Find all pending non-Rest plans within +/- 4 days of the run
	const nearbyPlans = await db
		.prepare(
			`SELECT id, scheduled_date, type
			 FROM training_plan
			 WHERE status = 'Pending'
			   AND type != 'Rest'
			   AND scheduled_date BETWEEN date(?, '-4 days') AND date(?, '+4 days')
			 ORDER BY scheduled_date`
		)
		.bind(runDateOnly, runDateOnly)
		.all<{ id: string; scheduled_date: string; type: string }>();

	if (nearbyPlans.results.length === 0) {
		return false; // No nearby plans to match
	}

	// Find the closest plan by date difference
	let closestPlan: { id: string; scheduled_date: string; type: string } | null = null;
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
		await updatePlanStatus(db, closestPlan.id, 'Completed');
		console.log(`✓ Matched run from ${runDateOnly} to plan on ${closestPlan.scheduled_date}`);
		return true;
	}

	return false;
}

// Get the next scheduled run
export async function getNextRun(db: Database): Promise<TrainingPlan | null> {
	return await db
		.prepare(
			`SELECT * FROM training_plan 
			 WHERE scheduled_date >= date('now') AND status = 'Pending'
			 ORDER BY scheduled_date ASC 
			 LIMIT 1`
		)
		.first<TrainingPlan>();
}

// Push subscription management
export async function savePushSubscription(
	db: Database,
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
		)
		.bind(id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth)
		.run();
}

export async function getPushSubscriptions(db: Database): Promise<PushSubscription[]> {
	const result = await db
		.prepare('SELECT * FROM push_subscriptions')
		.all<PushSubscription>();
	return result.results;
}

export async function deletePushSubscription(db: Database, endpoint: string): Promise<void> {
	await db
		.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
		.bind(endpoint)
		.run();
}
