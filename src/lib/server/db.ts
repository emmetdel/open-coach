// Database helpers for D1

export interface Run {
	garmin_activity_id: string;
	date: string;
	distance_meters: number;
	duration_seconds: number;
	avg_hr: number | null;
	max_hr: number | null;
	stress_score: number | null;
	ai_feedback: string | null;
	synced_to_calendar: boolean;
}

export interface TrainingPlan {
	id: string;
	scheduled_date: string;
	type: 'Easy' | 'Interval' | 'Long' | 'Rest';
	target_distance_km: number;
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

// Get a single setting
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
	const result = await db
		.prepare('SELECT value FROM user_settings WHERE key = ?')
		.bind(key)
		.first<{ value: string }>();
	return result?.value ?? null;
}

// Get multiple settings
export async function getSettings(
	db: D1Database,
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
export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
	await db
		.prepare(
			'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		)
		.bind(key, value)
		.run();
}

// Set multiple settings
export async function setSettings(
	db: D1Database,
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
export async function getRecentRuns(db: D1Database, limit = 10): Promise<Run[]> {
	const result = await db
		.prepare('SELECT * FROM runs ORDER BY date DESC LIMIT ?')
		.bind(limit)
		.all<Run>();
	return result.results;
}

// Get a run by Garmin activity ID
export async function getRunByActivityId(
	db: D1Database,
	activityId: string
): Promise<Run | null> {
	return await db
		.prepare('SELECT * FROM runs WHERE garmin_activity_id = ?')
		.bind(activityId)
		.first<Run>();
}

// Insert a new run
export async function insertRun(db: D1Database, run: Omit<Run, 'synced_to_calendar'>): Promise<void> {
	await db
		.prepare(
			`INSERT INTO runs (garmin_activity_id, date, distance_meters, duration_seconds, avg_hr, max_hr, stress_score, ai_feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			run.garmin_activity_id,
			run.date,
			run.distance_meters,
			run.duration_seconds,
			run.avg_hr,
			run.max_hr,
			run.stress_score,
			run.ai_feedback
		)
		.run();
}

// Update AI feedback for a run
export async function updateRunFeedback(
	db: D1Database,
	activityId: string,
	feedback: string
): Promise<void> {
	await db
		.prepare('UPDATE runs SET ai_feedback = ? WHERE garmin_activity_id = ?')
		.bind(feedback, activityId)
		.run();
}

// Get all existing activity IDs (for deduplication)
export async function getExistingActivityIds(db: D1Database): Promise<Set<string>> {
	const result = await db
		.prepare('SELECT garmin_activity_id FROM runs')
		.all<{ garmin_activity_id: string }>();
	return new Set(result.results.map((r) => r.garmin_activity_id));
}

// Calculate consistency stats (runs per week for the last N weeks)
export async function getConsistencyStats(
	db: D1Database,
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

// Check if user has completed setup
export async function hasCompletedSetup(db: D1Database): Promise<boolean> {
	const garminEmail = await getSetting(db, SETTING_KEYS.GARMIN_EMAIL);
	const openrouterKey = await getSetting(db, SETTING_KEYS.OPENROUTER_KEY);
	return !!(garminEmail && openrouterKey);
}

// Push subscription management
export async function savePushSubscription(
	db: D1Database,
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

export async function getPushSubscriptions(db: D1Database): Promise<PushSubscription[]> {
	const result = await db
		.prepare('SELECT * FROM push_subscriptions')
		.all<PushSubscription>();
	return result.results;
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<void> {
	await db
		.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
		.bind(endpoint)
		.run();
}
