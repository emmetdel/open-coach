import type { PageServerLoad } from './$types';
import { getSettings, SETTING_KEYS } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { existingSettings: null };
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
			garminEmail: settings[SETTING_KEYS.GARMIN_EMAIL] || '',
			targetDate: settings[SETTING_KEYS.TARGET_DATE] || '',
			availableDays: availableDays ? JSON.parse(availableDays) : [],
			currentFitness: settings[SETTING_KEYS.CURRENT_FITNESS] || ''
		}
	};
};

