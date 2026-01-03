// Garmin Connect integration service
// Supports both garmin-connect library and direct API with Garth tokens

/// <reference types="@cloudflare/workers-types" />

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
	params?: Record<string, string | number>,
	retryCount = 0
): Promise<unknown> {
	// Proactively refresh token if needed
	await ensureValidToken(db);

	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);

	if (!oauth2Str) {
		throw new Error(
			'Garmin not connected. Run the Python auth script (scripts/garmin-auth.py) to authenticate.'
		);
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

	if (response.status === 401 && retryCount < 2) {
		// Token expired - try to refresh
		console.log('Token expired, attempting refresh...');
		const refreshed = await refreshToken(db, oauth2);
		if (refreshed) {
			// Retry with new token
			return garminApiRequest(db, endpoint, params, retryCount + 1);
		}
		throw new Error(
			'Garmin session expired. Please run the auth script again: python scripts/garmin-auth.py'
		);
	}

	if (!response.ok) {
		const text = await response.text();
		console.error('Garmin API error response:', text.slice(0, 500));
		throw new Error(`Garmin API error: ${response.status}`);
	}

	return response.json();
}

// Refresh OAuth2 token
// Refresh OAuth2 token using OAuth1 credentials
async function refreshToken(db: D1Database, oauth2: OAuth2Token): Promise<boolean> {
	try {
		// Get OAuth1 token for authentication
		const oauth1Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);
		if (!oauth1Str) {
			console.error('No OAuth1 token for refresh');
			return false;
		}

		const oauth1 = JSON.parse(oauth1Str);

		// Garmin uses a specific refresh endpoint with OAuth1 auth
		// The refresh_token grant requires OAuth1 signature
		const response = await fetch('https://connect.garmin.com/services/auth/token/refresh', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': `Bearer ${oauth2.refresh_token}`
			},
			body: new URLSearchParams({
				refresh_token: oauth2.refresh_token,
				grant_type: 'refresh_token'
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Token refresh failed:', response.status, errorText);
			
			// Try alternative refresh method using OAuth1
			return await refreshTokenWithOAuth1(db, oauth1, oauth2);
		}

		const newToken = await response.json() as OAuth2Token;
		// Preserve refresh_token if not returned
		if (!newToken.refresh_token) {
			newToken.refresh_token = oauth2.refresh_token;
		}
		await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
		console.log('Token refreshed successfully');
		return true;
	} catch (error) {
		console.error('Token refresh error:', error);
		return false;
	}
}

// Alternative refresh using OAuth1 exchange
async function refreshTokenWithOAuth1(
	db: D1Database,
	oauth1: { oauth_token: string; oauth_token_secret: string },
	_oauth2: OAuth2Token
): Promise<boolean> {
	try {
		// Exchange OAuth1 for new OAuth2 token
		const response = await fetch('https://connect.garmin.com/modern/di-oauth/exchange', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': `OAuth oauth_token="${oauth1.oauth_token}"`
			}
		});

		if (!response.ok) {
			console.error('OAuth1 exchange failed:', response.status);
			return false;
		}

		const newToken = await response.json() as OAuth2Token;
		await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(newToken));
		console.log('Token refreshed via OAuth1 exchange');
		return true;
	} catch (error) {
		console.error('OAuth1 exchange error:', error);
		return false;
	}
}

// Check if token needs refresh (expires within 5 minutes)
function tokenNeedsRefresh(oauth2: OAuth2Token): boolean {
	if (!oauth2.expires_at) return false;
	const expiresAt = new Date(oauth2.expires_at).getTime();
	const now = Date.now();
	const fiveMinutes = 5 * 60 * 1000;
	return expiresAt - now < fiveMinutes;
}

// Proactively refresh token if needed
async function ensureValidToken(db: D1Database): Promise<boolean> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	if (!oauth2Str) return false;

	const oauth2: OAuth2Token = JSON.parse(oauth2Str);
	
	if (tokenNeedsRefresh(oauth2)) {
		console.log('Token expiring soon, refreshing proactively...');
		return await refreshToken(db, oauth2);
	}
	
	return true;
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

// =========== WORKOUT SYNC TO GARMIN WATCH ===========

export interface WorkoutStep {
	type: 'warmup' | 'run' | 'walk' | 'cooldown' | 'rest' | 'recovery';
	durationType: 'time' | 'distance' | 'open';
	durationValue?: number; // seconds for time, meters for distance
	targetType?: 'pace' | 'heart_rate' | 'open';
	targetValueLow?: number;
	targetValueHigh?: number;
	description?: string;
}

export interface StructuredWorkout {
	name: string;
	description: string;
	sportType: 'running';
	steps: WorkoutStep[];
}

// Convert our training plan to Garmin workout format
function buildGarminWorkout(
	name: string,
	description: string,
	type: string,
	durationMinutes: number | null,
	distanceKm: number | null
): object {
	const steps: object[] = [];
	let stepOrder = 1;

	// Always add a warm-up walk
	steps.push({
		type: 'ExecutableStepDTO',
		stepId: null,
		stepOrder: stepOrder++,
		childStepId: null,
		description: '🚶 Easy walk to warm up your muscles. Breathe deeply and relax.',
		stepType: {
			stepTypeId: 1, // Warmup
			stepTypeKey: 'warmup'
		},
		endCondition: {
			conditionTypeId: 2, // Time
			conditionTypeKey: 'time'
		},
		endConditionValue: 300, // 5 minutes warmup
		targetType: {
			workoutTargetTypeId: 1, // No target
			workoutTargetTypeKey: 'no.target'
		},
		targetValueOne: null,
		targetValueTwo: null
	});

	if (type === 'Walk-Run') {
		// Walk-Run intervals
		const totalTime = (durationMinutes || 20) * 60; // Convert to seconds
		const intervalTime = 120; // 2 minutes per interval (1 min run + 1 min walk)
		const numIntervals = Math.floor((totalTime - 600) / intervalTime); // Subtract warmup/cooldown

		// Create a repeat group for walk-run intervals
		steps.push({
			type: 'RepeatGroupDTO',
			stepId: null,
			stepOrder: stepOrder++,
			numberOfIterations: numIntervals,
			smartRepeat: false,
			childStepId: 1,
			workoutSteps: [
				{
					type: 'ExecutableStepDTO',
					stepId: null,
					stepOrder: 1,
					description: '🏃 RUN! Easy jog - you should be able to speak short sentences.',
					stepType: {
						stepTypeId: 3, // Run/Interval
						stepTypeKey: 'interval'
					},
					endCondition: {
						conditionTypeId: 2, // Time
						conditionTypeKey: 'time'
					},
					endConditionValue: 60, // 1 minute run
					targetType: {
						workoutTargetTypeId: 1,
						workoutTargetTypeKey: 'no.target'
					}
				},
				{
					type: 'ExecutableStepDTO',
					stepId: null,
					stepOrder: 2,
					description: '🚶 WALK. Catch your breath. You earned this recovery!',
					stepType: {
						stepTypeId: 4, // Recovery
						stepTypeKey: 'recovery'
					},
					endCondition: {
						conditionTypeId: 2,
						conditionTypeKey: 'time'
					},
					endConditionValue: 60, // 1 minute walk
					targetType: {
						workoutTargetTypeId: 1,
						workoutTargetTypeKey: 'no.target'
					}
				}
			]
		});
	} else if (type === 'Easy' || type === 'Long') {
		// Steady run
		const runDuration = durationMinutes
			? (durationMinutes - 10) * 60 // Subtract warmup/cooldown
			: distanceKm
				? (distanceKm - 1) * 1000 // Distance minus warmup/cooldown
				: 1800; // Default 30 min

		const runDescription = type === 'Long'
			? '🏃 Easy, steady pace. This builds endurance. Walk if needed!'
			: '🏃 Conversational pace - if you can chat, you\'re doing great!';

		steps.push({
			type: 'ExecutableStepDTO',
			stepId: null,
			stepOrder: stepOrder++,
			description: runDescription,
			stepType: {
				stepTypeId: 3, // Run
				stepTypeKey: 'interval'
			},
			endCondition: durationMinutes
				? {
						conditionTypeId: 2, // Time
						conditionTypeKey: 'time'
					}
				: {
						conditionTypeId: 3, // Distance
						conditionTypeKey: 'distance'
					},
			endConditionValue: durationMinutes ? runDuration : (distanceKm! - 1) * 1000,
			targetType: {
				workoutTargetTypeId: 1,
				workoutTargetTypeKey: 'no.target'
			}
		});
	}

	// Add cool-down walk
	steps.push({
		type: 'ExecutableStepDTO',
		stepId: null,
		stepOrder: stepOrder++,
		description: '🚶 Cool down walk. Great job! Let your heart rate come down slowly.',
		stepType: {
			stepTypeId: 2, // Cooldown
			stepTypeKey: 'cooldown'
		},
		endCondition: {
			conditionTypeId: 2,
			conditionTypeKey: 'time'
		},
		endConditionValue: 300, // 5 minutes cooldown
		targetType: {
			workoutTargetTypeId: 1,
			workoutTargetTypeKey: 'no.target'
		}
	});

	return {
		workoutId: null,
		ownerId: null,
		workoutName: name,
		description: description,
		sportType: {
			sportTypeId: 1,
			sportTypeKey: 'running'
		},
		workoutSegments: [
			{
				segmentOrder: 1,
				sportType: {
					sportTypeId: 1,
					sportTypeKey: 'running'
				},
				workoutSteps: steps
			}
		]
	};
}

// Format workout name like Runna: "W3 Tue Walk-Run - 20 min intervals"
function formatWorkoutName(
	weekNumber: number,
	scheduledDate: string,
	type: string,
	durationMinutes: number | null,
	distanceKm: number | null
): string {
	const date = new Date(scheduledDate + 'T12:00:00');
	const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

	let suffix = '';
	if (type === 'Walk-Run') {
		suffix = durationMinutes ? `${durationMinutes}min intervals` : 'intervals';
	} else if (type === 'Easy') {
		suffix = distanceKm ? `${distanceKm}km easy` : 'easy pace';
	} else if (type === 'Long') {
		suffix = distanceKm ? `${distanceKm}km long run` : 'long run';
	} else {
		suffix = distanceKm ? `${distanceKm}km` : `${durationMinutes}min`;
	}

	return `W${weekNumber} ${dayName} ${type} - ${suffix}`;
}

// Push a workout to Garmin Connect
export async function pushWorkoutToGarmin(
	db: D1Database,
	weekNumber: number,
	scheduledDate: string,
	description: string,
	type: string,
	durationMinutes: number | null,
	distanceKm: number | null
): Promise<{ success: boolean; workoutId?: string; error?: string }> {
	try {
		const hasTokens = await hasValidTokens(db);
		if (!hasTokens) {
			return { success: false, error: 'Garmin not connected' };
		}

		// Format name like Runna
		const name = formatWorkoutName(weekNumber, scheduledDate, type, durationMinutes, distanceKm);

		// Build workout structure
		const workout = buildGarminWorkout(name, description, type, durationMinutes, distanceKm);

		// Get OAuth token
		const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
		if (!oauth2Str) {
			return { success: false, error: 'No Garmin token' };
		}
		const oauth2: OAuth2Token = JSON.parse(oauth2Str);

		console.log('Pushing workout to Garmin:', name);
		console.log('Scheduled for:', scheduledDate);

		// Create workout
		const createResponse = await fetch(`${GARMIN_CONNECT_API}/workout-service/workout`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${oauth2.access_token}`,
				'Content-Type': 'application/json',
				'NK': 'NT',
				'Accept': 'application/json'
			},
			body: JSON.stringify(workout)
		});

		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			console.error('Garmin workout create error:', createResponse.status, errorText);
			return { success: false, error: `Garmin API error: ${createResponse.status}` };
		}

		const createdWorkout = await createResponse.json() as { workoutId: number };
		const workoutId = String(createdWorkout.workoutId);

		console.log('Created Garmin workout:', workoutId);

		// Schedule the workout for the specific date
		await scheduleWorkout(db, oauth2, workoutId, scheduledDate);

		return { success: true, workoutId };
	} catch (error) {
		console.error('Push workout error:', error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

// Schedule a workout for a specific date
async function scheduleWorkout(
	_db: D1Database,
	oauth2: OAuth2Token,
	workoutId: string,
	date: string
): Promise<void> {
	// Garmin expects date in YYYY-MM-DD format
	// The API endpoint is: PUT /workout-service/schedule/{workoutId}
	// with body: { "date": "2026-01-06" }

	console.log('Scheduling workout', workoutId, 'for date:', date);

	const scheduleResponse = await fetch(
		`${GARMIN_CONNECT_API}/workout-service/schedule/${workoutId}`,
		{
			method: 'PUT', // Garmin uses PUT for scheduling
			headers: {
				'Authorization': `Bearer ${oauth2.access_token}`,
				'Content-Type': 'application/json',
				'NK': 'NT',
				'Accept': 'application/json'
			},
			body: JSON.stringify({ date }) // date should be YYYY-MM-DD
		}
	);

	if (!scheduleResponse.ok) {
		const errorText = await scheduleResponse.text();
		console.error('Failed to schedule workout:', scheduleResponse.status, errorText);
	} else {
		console.log('Successfully scheduled workout for:', date);
	}
}

// Delete a workout from Garmin
export async function deleteGarminWorkout(
	db: D1Database,
	workoutId: string
): Promise<boolean> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	if (!oauth2Str) return false;

	const oauth2: OAuth2Token = JSON.parse(oauth2Str);

	const response = await fetch(
		`${GARMIN_CONNECT_API}/workout-service/workout/${workoutId}`,
		{
			method: 'DELETE',
			headers: {
				'Authorization': `Bearer ${oauth2.access_token}`,
				'NK': 'NT'
			}
		}
	);

	console.log('Delete workout', workoutId, ':', response.status);
	return response.ok;
}

// Delete all OpenCoach workouts from Garmin
export async function deleteAllOpenCoachWorkouts(
	db: D1Database
): Promise<{ deleted: number; errors: number }> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	if (!oauth2Str) {
		return { deleted: 0, errors: 0 };
	}

	const oauth2: OAuth2Token = JSON.parse(oauth2Str);

	// Fetch all workouts from Garmin
	const response = await fetch(
		`${GARMIN_CONNECT_API}/workout-service/workouts?start=0&limit=100`,
		{
			headers: {
				'Authorization': `Bearer ${oauth2.access_token}`,
				'NK': 'NT',
				'Accept': 'application/json'
			}
		}
	);

	if (!response.ok) {
		console.error('Failed to fetch workouts:', response.status);
		return { deleted: 0, errors: 1 };
	}

	const workouts = await response.json() as Array<{ workoutId: number; workoutName: string }>;

	// Filter to only OpenCoach workouts (start with "W" and contain "-" like Runna format, or "OpenCoach:")
	const openCoachWorkouts = workouts.filter(
		(w) => w.workoutName.startsWith('OpenCoach:') || 
			   (w.workoutName.match(/^W\d+\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/) !== null)
	);

	console.log(`Found ${openCoachWorkouts.length} OpenCoach workouts to delete`);

	let deleted = 0;
	let errors = 0;

	for (const workout of openCoachWorkouts) {
		const success = await deleteGarminWorkout(db, String(workout.workoutId));
		if (success) {
			deleted++;
		} else {
			errors++;
		}
	}

	// Also clear the garmin_workout_id from our database
	const { clearAllGarminWorkoutIds } = await import('./db');
	await clearAllGarminWorkoutIds(db);

	return { deleted, errors };
}

// Push all pending workouts to Garmin (up to specified limit)
export async function pushWeekToGarmin(
	db: D1Database,
	limit = 14 // Default to 2 weeks
): Promise<{ success: boolean; pushed: number; errors: string[] }> {
	const { getUpcomingPlans, updatePlanGarminId } = await import('./db');

	const plans = await getUpcomingPlans(db, limit);
	let pushed = 0;
	const errors: string[] = [];

	for (const plan of plans) {
		// Skip if already synced
		if (plan.garmin_workout_id) {
			continue;
		}

		const result = await pushWorkoutToGarmin(
			db,
			plan.week_number || 1,
			plan.scheduled_date,
			plan.description,
			plan.type,
			plan.target_duration_minutes,
			plan.target_distance_km
		);

		if (result.success && result.workoutId) {
			await updatePlanGarminId(db, plan.id, result.workoutId);
			pushed++;
		} else {
			errors.push(`${plan.scheduled_date}: ${result.error}`);
		}
	}

	return { success: errors.length === 0, pushed, errors };
}
