import type { PageServerLoad } from './$types';
import { getSettings, SETTING_KEYS, hasEnvGarminCredentials } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	
	// Check if Garmin credentials are set via environment variables
	const garminFromEnv = hasEnvGarminCredentials();
	
	if (!db) {
		return { 
			existingSettings: null,
			garminFromEnv
		};
	}

	// Load existing settings so user can edit them
	const settings = await getSettings(db, [
		SETTING_KEYS.GARMIN_EMAIL,
		SETTING_KEYS.TARGET_DATE,
		SETTING_KEYS.AVAILABLE_DAYS,
		SETTING_KEYS.CURRENT_FITNESS
	]);

	const availableDays = settings[SETTING_KEYS.AVAILABLE_DAYS];

	return {
		existingSettings: {
			// If env vars are set, show that email instead
			garminEmail: garminFromEnv ? process.env.GARMIN_EMAIL : (settings[SETTING_KEYS.GARMIN_EMAIL] || ''),
			targetDate: settings[SETTING_KEYS.TARGET_DATE] || '',
			availableDays: availableDays ? JSON.parse(availableDays) : [],
			currentFitness: settings[SETTING_KEYS.CURRENT_FITNESS] || ''
		},
		garminFromEnv
	};
};
