// Cron handler for proactive Garmin token refresh
// Triggered every hour to keep tokens fresh

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSetting, SETTING_KEYS, hasCompletedSetup } from '$lib/server/db';

interface OAuth2Token {
	access_token: string;
	refresh_token: string;
	expires_at?: string;
	expires_in?: number;
}

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db);
	if (!isSetup) {
		return json({
			success: false,
			message: 'Setup not complete, skipping token refresh'
		});
	}

	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	if (!oauth2Str) {
		return json({
			success: false,
			message: 'No Garmin tokens configured'
		});
	}

	const oauth2: OAuth2Token = JSON.parse(oauth2Str);

	// Check if token expires within 30 minutes
	if (oauth2.expires_at) {
		const expiresAt = new Date(oauth2.expires_at).getTime();
		const now = Date.now();
		const thirtyMinutes = 30 * 60 * 1000;

		if (expiresAt - now > thirtyMinutes) {
			return json({
				success: true,
				message: 'Token still valid, no refresh needed'
			});
		}
	}

	// Try to refresh
	try {
		const oauth1Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);

		// Try standard refresh
		let refreshed = false;

		const response = await fetch('https://connect.garmin.com/services/auth/token/refresh', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				refresh_token: oauth2.refresh_token,
				grant_type: 'refresh_token'
			})
		});

		if (response.ok) {
			const newToken = await response.json() as OAuth2Token;
			if (!newToken.refresh_token) {
				newToken.refresh_token = oauth2.refresh_token;
			}
			await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
			refreshed = true;
		}

		// If standard refresh failed and we have OAuth1, try exchange
		if (!refreshed && oauth1Str) {
			const oauth1 = JSON.parse(oauth1Str);
			const exchangeResponse = await fetch('https://connect.garmin.com/modern/di-oauth/exchange', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': `OAuth oauth_token="${oauth1.oauth_token}"`
				}
			});

			if (exchangeResponse.ok) {
				const newToken = await exchangeResponse.json() as OAuth2Token;
				await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
				refreshed = true;
			}
		}

		return json({
			success: refreshed,
			message: refreshed ? 'Token refreshed successfully' : 'Token refresh failed'
		});
	} catch (err) {
		console.error('Token refresh cron failed:', err);
		return json({
			success: false,
			message: err instanceof Error ? err.message : 'Unknown error'
		});
	}
};

