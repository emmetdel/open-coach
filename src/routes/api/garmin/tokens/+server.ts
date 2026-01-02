import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSetting, getSetting, SETTING_KEYS } from '$lib/server/db';

// POST: Import Garmin tokens from Garth (Python)
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const { oauth1, oauth2 } = await request.json();

	if (!oauth1 || !oauth2) {
		throw error(400, 'Both oauth1 and oauth2 tokens are required');
	}

	// Save tokens
	await setSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN, JSON.stringify(oauth1));
	await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(oauth2));

	return json({
		success: true,
		message: 'Garmin tokens imported successfully'
	});
};

// GET: Check if tokens exist
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const oauth1 = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);
	const oauth2 = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);

	return json({
		hasTokens: !!(oauth1 && oauth2)
	});
};

