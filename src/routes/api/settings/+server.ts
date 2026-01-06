import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSettings, SETTING_KEYS, AVAILABLE_MODELS, hasCompletedSetup } from '$lib/server/db';
import { validateApiKey } from '$lib/server/coach';

export interface SettingsPayload {
	garmin_email?: string;
	garmin_password?: string;
	openrouter_key?: string;
	openrouter_model?: string;
	target_date?: string;
	available_days?: string[];
	current_fitness?: string;
	notification_email?: string;
	email_enabled?: boolean;
	notify_on_sync?: boolean;
	notify_on_missed?: boolean;
	skip_validation?: boolean; // Skip external API validation (for testing/dev)
}

export interface SettingsResponse {
	garmin_email: string | null;
	has_garmin_password: boolean;
	has_openrouter_key: boolean;
	openrouter_model: string | null;
	target_date: string | null;
	available_days: string[] | null;
	current_fitness: string | null;
	notification_email: string | null;
	push_enabled: boolean;
	email_enabled: boolean;
	notify_on_sync: boolean;
	notify_on_missed: boolean;
	is_complete: boolean;
	available_models: typeof AVAILABLE_MODELS;
}

// GET: Load current settings (passwords redacted)
export const GET: RequestHandler = async ({ locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const [
		garminEmail,
		garminPassword,
		openrouterKey,
		openrouterModel,
		targetDate,
		availableDays,
		currentFitness,
		notificationEmail,
		pushEnabled,
		emailEnabled,
		notifyOnSync,
		notifyOnMissed
	] = await Promise.all([
		getSetting(db, SETTING_KEYS.GARMIN_EMAIL),
		getSetting(db, SETTING_KEYS.GARMIN_PASSWORD),
		getSetting(db, SETTING_KEYS.OPENROUTER_KEY),
		getSetting(db, SETTING_KEYS.OPENROUTER_MODEL),
		getSetting(db, SETTING_KEYS.TARGET_DATE),
		getSetting(db, SETTING_KEYS.AVAILABLE_DAYS),
		getSetting(db, SETTING_KEYS.CURRENT_FITNESS),
		getSetting(db, SETTING_KEYS.NOTIFICATION_EMAIL),
		getSetting(db, SETTING_KEYS.PUSH_ENABLED),
		getSetting(db, SETTING_KEYS.EMAIL_ENABLED),
		getSetting(db, SETTING_KEYS.NOTIFY_ON_SYNC),
		getSetting(db, SETTING_KEYS.NOTIFY_ON_MISSED)
	]);

	const isComplete = await hasCompletedSetup(db);

	return json({
		garmin_email: garminEmail,
		has_garmin_password: !!garminPassword,
		has_openrouter_key: !!openrouterKey,
		openrouter_model: openrouterModel,
		target_date: targetDate,
		available_days: availableDays ? JSON.parse(availableDays) : null,
		current_fitness: currentFitness,
		notification_email: notificationEmail,
		push_enabled: pushEnabled === 'true',
		email_enabled: emailEnabled === 'true',
		notify_on_sync: notifyOnSync === 'true',
		notify_on_missed: notifyOnMissed === 'true',
		is_complete: isComplete,
		available_models: AVAILABLE_MODELS
	} satisfies SettingsResponse);
};

// DELETE: Reset settings (clear Garmin credentials)
export const DELETE: RequestHandler = async ({ url, locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const what = url.searchParams.get('what') || 'garmin';

	const keysToDelete: string[] = [];

	if (what === 'garmin' || what === 'all') {
		keysToDelete.push(
			SETTING_KEYS.GARMIN_EMAIL,
			SETTING_KEYS.GARMIN_PASSWORD,
			SETTING_KEYS.GARMIN_OAUTH1_TOKEN,
			SETTING_KEYS.GARMIN_OAUTH2_TOKEN
		);
	}

	if (what === 'goals' || what === 'all') {
		keysToDelete.push(
			SETTING_KEYS.TARGET_DATE,
			SETTING_KEYS.AVAILABLE_DAYS,
			SETTING_KEYS.CURRENT_FITNESS
		);
	}

	if (what === 'all') {
		keysToDelete.push(
			SETTING_KEYS.OPENROUTER_KEY,
			SETTING_KEYS.OPENROUTER_MODEL,
			SETTING_KEYS.NOTIFICATION_EMAIL,
			SETTING_KEYS.EMAIL_ENABLED,
			SETTING_KEYS.PUSH_ENABLED
		);
	}

	if (keysToDelete.length > 0) {
		const placeholders = keysToDelete.map(() => '?').join(',');
		await db
			.prepare(`DELETE FROM user_settings WHERE key IN (${placeholders})`)
			.bind(...keysToDelete)
			.run();
	}

	return json({
		success: true,
		message: `Reset ${what} settings successfully`,
		deleted: keysToDelete
	});
};

// POST: Save settings
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const payload = (await request.json()) as SettingsPayload;
	const settingsToSave: Record<string, string> = {};
	const validationErrors: string[] = [];

	// Save Garmin credentials if provided
	// Note: With token-based auth, validation happens during sync
	if (payload.garmin_email && payload.garmin_password) {
		settingsToSave[SETTING_KEYS.GARMIN_EMAIL] = payload.garmin_email;
		settingsToSave[SETTING_KEYS.GARMIN_PASSWORD] = payload.garmin_password;
	} else if (payload.garmin_email) {
		settingsToSave[SETTING_KEYS.GARMIN_EMAIL] = payload.garmin_email;
	}

	// Validate OpenRouter key if provided (skip if requested)
	if (payload.openrouter_key) {
		if (payload.skip_validation) {
			settingsToSave[SETTING_KEYS.OPENROUTER_KEY] = payload.openrouter_key;
		} else {
			const isValid = await validateApiKey(payload.openrouter_key, payload.openrouter_model);
			if (!isValid) {
				validationErrors.push('Invalid OpenRouter API key');
			} else {
				settingsToSave[SETTING_KEYS.OPENROUTER_KEY] = payload.openrouter_key;
			}
		}
	}

	// Save model selection
	if (payload.openrouter_model) {
		settingsToSave[SETTING_KEYS.OPENROUTER_MODEL] = payload.openrouter_model;
	}

	// Save goal settings
	if (payload.target_date) {
		settingsToSave[SETTING_KEYS.TARGET_DATE] = payload.target_date;
	}
	if (payload.available_days) {
		settingsToSave[SETTING_KEYS.AVAILABLE_DAYS] = JSON.stringify(payload.available_days);
	}
	if (payload.current_fitness !== undefined) {
		settingsToSave[SETTING_KEYS.CURRENT_FITNESS] = payload.current_fitness;
	}

	// Save notification settings
	if (payload.notification_email !== undefined) {
		settingsToSave[SETTING_KEYS.NOTIFICATION_EMAIL] = payload.notification_email;
	}
	if (payload.email_enabled !== undefined) {
		settingsToSave[SETTING_KEYS.EMAIL_ENABLED] = payload.email_enabled ? 'true' : 'false';
	}
	if (payload.notify_on_sync !== undefined) {
		settingsToSave[SETTING_KEYS.NOTIFY_ON_SYNC] = payload.notify_on_sync ? 'true' : 'false';
	}
	if (payload.notify_on_missed !== undefined) {
		settingsToSave[SETTING_KEYS.NOTIFY_ON_MISSED] = payload.notify_on_missed ? 'true' : 'false';
	}

	// Return validation errors if any
	if (validationErrors.length > 0) {
		return json(
			{
				success: false,
				errors: validationErrors
			},
			{ status: 400 }
		);
	}

	// Save settings
	if (Object.keys(settingsToSave).length > 0) {
		await setSettings(db, settingsToSave);
	}

	return json({
		success: true,
		message: 'Settings saved successfully'
	});
};
