// Garmin Connect integration service
// Supports both garmin-connect library and direct API with Garth tokens

import { getSetting, setSetting, getSettings, SETTING_KEYS } from './db';

const GARMIN_CONNECT_API = 'https://connectapi.garmin.com';

export interface GarminActivity {
	activityId: string | number;
	activityName: string;
	startTimeLocal: string;
	distance: number; // meters
	duration: number; // seconds
	averageHR?: number;
	maxHR?: number;
	activityType: {
		typeKey: string;
	};
}

export interface NormalizedRun {
	garmin_activity_id: string;
	date: string;
	distance_meters: number;
	duration_seconds: number;
	avg_hr: number | null;
	max_hr: number | null;
	stress_score: number | null;
}

interface OAuth2Token {
	access_token: string;
	refresh_token: string;
	expires_at?: number;
	token_type?: string;
}

// Make authenticated request to Garmin Connect API using OAuth2 token
async function garminApiRequest(
	db: D1Database,
	endpoint: string,
	params?: Record<string, string | number>
): Promise<unknown> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);

	if (!oauth2Str) {
		throw new Error('Garmin tokens not configured. Run the auth script first.');
	}

	const oauth2: OAuth2Token = JSON.parse(oauth2Str);

	// Build URL with query params
	let url = `${GARMIN_CONNECT_API}${endpoint}`;
	if (params) {
		const searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			searchParams.set(key, String(value));
		}
		url += '?' + searchParams.toString();
	}

	console.log('Garmin API request:', url);

	const response = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${oauth2.access_token}`,
			'Content-Type': 'application/json',
			'NK': 'NT',
			'User-Agent': 'Mozilla/5.0 (compatible; OpenCoach/1.0)',
			'Accept': 'application/json'
		}
	});

	console.log('Garmin API response status:', response.status);

	if (response.status === 401) {
		// Token expired - need to refresh
		const refreshed = await refreshToken(db, oauth2);
		if (refreshed) {
			// Retry with new token
			return garminApiRequest(db, endpoint, params);
		}
		throw new Error('Garmin session expired. Please re-authenticate.');
	}

	if (!response.ok) {
		const text = await response.text();
		console.error('Garmin API error response:', text.slice(0, 500));
		throw new Error(`Garmin API error: ${response.status}`);
	}

	return response.json();
}

// Refresh OAuth2 token
async function refreshToken(db: D1Database, oauth2: OAuth2Token): Promise<boolean> {
	try {
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

		if (!response.ok) {
			console.error('Token refresh failed:', response.status);
			return false;
		}

		const newToken = await response.json() as OAuth2Token;
		await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
		return true;
	} catch (error) {
		console.error('Token refresh error:', error);
		return false;
	}
}

// Check if we have valid tokens
export async function hasValidTokens(db: D1Database): Promise<boolean> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	return !!oauth2Str;
}

// Fetch recent running activities using direct API
export async function fetchRecentRuns(
	db: D1Database,
	limit = 10
): Promise<NormalizedRun[]> {
	const hasTokens = await hasValidTokens(db);

	if (!hasTokens) {
		throw new Error(
			'Garmin not connected. Run the Python auth script (scripts/garmin-auth.py) to authenticate.'
		);
	}

	try {
		const response = await garminApiRequest(
			db,
			'/activitylist-service/activities/search/activities',
			{ limit, start: 0 }
		);

		console.log('Garmin API response type:', typeof response, Array.isArray(response));
		console.log('Garmin API response preview:', JSON.stringify(response).slice(0, 500));

		// Handle different response formats
		let activities: GarminActivity[];
		if (Array.isArray(response)) {
			activities = response as GarminActivity[];
		} else if (response && typeof response === 'object' && 'activityList' in response) {
			activities = (response as { activityList: GarminActivity[] }).activityList;
		} else if (response && typeof response === 'object') {
			// Try to find an array property
			const keys = Object.keys(response as object);
			console.log('Response keys:', keys);
			const arrayKey = keys.find(k => Array.isArray((response as Record<string, unknown>)[k]));
			if (arrayKey) {
				activities = (response as Record<string, GarminActivity[]>)[arrayKey];
			} else {
				throw new Error(`Unexpected response format. Keys: ${keys.join(', ')}`);
			}
		} else {
			console.error('Unexpected Garmin API response:', JSON.stringify(response).slice(0, 200));
			throw new Error('Unexpected response format from Garmin API');
		}

		// Filter to only running activities
		const runs = activities.filter(
			(a) =>
				a.activityType?.typeKey === 'running' ||
				a.activityType?.typeKey === 'trail_running' ||
				a.activityType?.typeKey === 'treadmill_running'
		);

		return runs.map(normalizeActivity);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';

		if (message.includes('expired') || message.includes('401')) {
			throw new Error(
				'Garmin session expired. Please run the auth script again: python scripts/garmin-auth.py'
			);
		}

		throw error;
	}
}

// Normalize Garmin activity to our database format
export function normalizeActivity(activity: GarminActivity): NormalizedRun {
	return {
		garmin_activity_id: String(activity.activityId),
		date: activity.startTimeLocal,
		distance_meters: Math.round(activity.distance || 0),
		duration_seconds: Math.round(activity.duration || 0),
		avg_hr: activity.averageHR ? Math.round(activity.averageHR) : null,
		max_hr: activity.maxHR ? Math.round(activity.maxHR) : null,
		stress_score: null
	};
}

// Helper to format distance for display
export function formatDistance(meters: number): string {
	const km = meters / 1000;
	return `${km.toFixed(2)} km`;
}

// Helper to format duration for display
export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Helper to calculate pace
export function calculatePace(meters: number, seconds: number): string {
	if (meters === 0) return '--:--';
	const paceSecondsPerKm = seconds / (meters / 1000);
	const paceMinutes = Math.floor(paceSecondsPerKm / 60);
	const paceSeconds = Math.round(paceSecondsPerKm % 60);
	return `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}/km`;
}

// Validate credentials - not used with token-based auth
export async function validateCredentials(): Promise<boolean> {
	// With token-based auth, validation happens during sync
	return true;
}
