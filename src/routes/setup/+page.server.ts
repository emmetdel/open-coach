import type { PageServerLoad } from './$types';
import { getSettings, SETTING_KEYS, hasEnvGarminCredentials, getActiveGoals, getPlanMetadata } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	const user = locals.user;
	
	// Check if Garmin credentials are set via environment variables
	const garminFromEnv = hasEnvGarminCredentials();
	
	if (!db || !user) {
		return { 
			existingSettings: null,
			garminFromEnv
		};
	}

	const goals = await getActiveGoals(db, user.id);
	const metadata = await getPlanMetadata(db, user.id);
	const primaryGoalId = metadata['primary_goal_id'];
	const primaryGoal = primaryGoalId ? goals.find((goal) => goal.id === primaryGoalId) : goals[0] || null;

	// Load existing settings so user can edit them
	const settings = await getSettings(db, user.id, [
		SETTING_KEYS.GARMIN_EMAIL,
		SETTING_KEYS.AVAILABLE_DAYS,
		SETTING_KEYS.CURRENT_FITNESS
	]);

	const availableDays = settings[SETTING_KEYS.AVAILABLE_DAYS];

	return {
		existingSettings: {
			// If env vars are set, show that email instead
			garminEmail: garminFromEnv ? process.env.GARMIN_EMAIL : (settings[SETTING_KEYS.GARMIN_EMAIL] || ''),
			availableDays: availableDays ? JSON.parse(availableDays) : [],
			currentFitness: settings[SETTING_KEYS.CURRENT_FITNESS] || ''
		},
		primaryGoal,
		garminFromEnv
	};
};
