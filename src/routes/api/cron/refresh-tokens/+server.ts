// Cron handler for proactive Garmin token refresh
// Triggered every 30 minutes to keep tokens fresh

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSetting, SETTING_KEYS, hasCompletedSetup, listUsers } from '$lib/server/db';
import { isCronAuthorized } from '$lib/server/cronAuth';

interface OAuth2Token {
	access_token: string;
	refresh_token: string;
	expires_at?: string;
	expires_in?: number;
}

export const GET: RequestHandler = async ({ locals, request }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Verify cron secret
	if (!isCronAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const users = await listUsers(db);
		let refreshedCount = 0;

		for (const user of users) {
			const isSetup = await hasCompletedSetup(db, user.id);
			if (!isSetup) {
				continue;
			}

			const oauth2Str = await getSetting(db, user.id, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
			if (!oauth2Str) {
				continue;
			}

			const oauth2: OAuth2Token = JSON.parse(oauth2Str);

			if (oauth2.expires_at) {
				const expiresAt = new Date(oauth2.expires_at).getTime();
				const now = Date.now();
				const thirtyMinutes = 30 * 60 * 1000;
				if (expiresAt - now > thirtyMinutes) {
					continue;
				}
			}

			const oauth1Str = await getSetting(db, user.id, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);

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
				await setSetting(db, user.id, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
				refreshed = true;
			}

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
					await setSetting(db, user.id, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
					refreshed = true;
				}
			}

			if (refreshed) {
				refreshedCount++;
			}
		}

		return json({
			success: true,
			message: refreshedCount > 0 ? `Refreshed ${refreshedCount} token(s)` : 'No refresh needed'
		});
	} catch (err) {
		console.error('Token refresh cron failed:', err);
		return json({
			success: false,
			message: err instanceof Error ? err.message : 'Unknown error'
		});
	}
};
