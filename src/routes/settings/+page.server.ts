import type { PageServerLoad } from './$types';
import { getSetting, SETTING_KEYS, hasEnvGarminCredentials } from '$lib/server/db';
import { hasValidTokens } from '$lib/server/garmin';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	if (!db || !locals.user) {
		return { settings: null };
	}
	const userId = locals.user.id;

	// Load all settings
	const [
		openrouterKey,
		openrouterModel,
		targetDate,
		availableDays,
		currentFitness,
		pushEnabled,
		garminConnected,
		planGenerationStrategy
	] = await Promise.all([
		getSetting(db, userId, SETTING_KEYS.OPENROUTER_KEY),
		getSetting(db, userId, SETTING_KEYS.OPENROUTER_MODEL),
		getSetting(db, userId, SETTING_KEYS.TARGET_DATE),
		getSetting(db, userId, SETTING_KEYS.AVAILABLE_DAYS),
		getSetting(db, userId, SETTING_KEYS.CURRENT_FITNESS),
		getSetting(db, userId, SETTING_KEYS.PUSH_ENABLED),
		hasValidTokens(db, userId),
		getSetting(db, userId, SETTING_KEYS.PLAN_GENERATION_STRATEGY)
	]);

	// Parse available days
	let daysArray: string[] = [];
	if (availableDays) {
		try {
			daysArray = JSON.parse(availableDays);
		} catch {
			daysArray = availableDays.split(',');
		}
	}

	return {
		settings: {
			// AI Settings
			hasOpenRouterKey: !!openrouterKey,
			openrouterModel: openrouterModel || 'anthropic/claude-sonnet-4',
			
			// Training Settings
			targetDate: targetDate || '',
			availableDays: daysArray,
			currentFitness: currentFitness || '',
			planGenerationStrategy: planGenerationStrategy || 'auto',
			
			// Notifications
			pushEnabled: pushEnabled === 'true',
			
			// Garmin
			garminConnected,
			garminFromEnv: hasEnvGarminCredentials()
		}
	};
};
