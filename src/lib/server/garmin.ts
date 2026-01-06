// Garmin Connect integration service
// Uses garmin-connect npm package for authentication and API calls

import pkg from 'garmin-connect';
const { GarminConnect } = pkg;
import { getSetting, setSetting, SETTING_KEYS, getGarminCredentials } from './db';
import type { LocalDatabase } from './sqlite';

// Type for the GarminConnect client instance
type GarminClient = InstanceType<typeof GarminConnect>;

type Database = LocalDatabase;

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

// Get authenticated Garmin client from stored tokens
async function getGarminClient(db: Database): Promise<GarminClient> {
	const oauth1Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);

	if (!oauth1Str || !oauth2Str) {
		throw new Error('Garmin not connected. Please login at /setup with your Garmin credentials.');
	}

	const oauth1 = JSON.parse(oauth1Str);
	const oauth2 = JSON.parse(oauth2Str);

	// Get stored credentials - GarminConnect constructor requires them
	const creds = await getGarminCredentials(db);
	if (!creds) {
		throw new Error('Garmin credentials not found. Please login at /setup with your Garmin credentials.');
	}

	const client = new GarminConnect({
		username: creds.email,
		password: creds.password
	});
	client.loadToken(oauth1, oauth2);

	return client;
}

// Save updated tokens after a request (in case they were refreshed)
async function saveTokens(db: Database, client: GarminClient): Promise<void> {
	const oauth1 = client.client.oauth1Token;
	const oauth2 = client.client.oauth2Token;

	if (oauth1 && oauth2) {
		await setSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN, JSON.stringify(oauth1));
		await setSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN, JSON.stringify(oauth2));
	}
}

// Check if we have valid tokens
export async function hasValidTokens(db: Database): Promise<boolean> {
	const oauth2Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH2_TOKEN);
	const oauth1Str = await getSetting(db, SETTING_KEYS.GARMIN_OAUTH1_TOKEN);
	return !!(oauth1Str && oauth2Str);
}

// Fetch recent running activities
export async function fetchRecentRuns(db: Database, limit = 10): Promise<NormalizedRun[]> {
	const hasTokens = await hasValidTokens(db);

	if (!hasTokens) {
		throw new Error('Garmin not connected. Please login at /setup with your Garmin credentials.');
	}

	try {
		const client = await getGarminClient(db);
		
		// Fetch activities
		const activities = await client.getActivities(0, limit);
		
		// Save tokens in case they were refreshed
		await saveTokens(db, client);

		console.log(`Fetched ${activities?.length || 0} activities from Garmin`);

		if (!activities || !Array.isArray(activities)) {
			console.error('Unexpected response format:', typeof activities);
			return [];
		}

		// Filter to only running activities
		const runs = activities.filter((a: GarminActivity) =>
			a.activityType?.typeKey === 'running' ||
			a.activityType?.typeKey === 'trail_running' ||
			a.activityType?.typeKey === 'treadmill_running'
		);

		console.log(`Found ${runs.length} running activities`);

		return runs.map(normalizeActivity);

	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';

		if (message.includes('401') || message.includes('expired') || message.includes('Unauthorized')) {
			throw new Error('Garmin session expired. Please re-login at /setup.');
		}

		throw err;
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

// Validate credentials - attempts login
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

		const runDescription =
			type === 'Long'
				? '🏃 Easy, steady pace. This builds endurance. Walk if needed!'
				: "🏃 Conversational pace - if you can chat, you're doing great!";

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
			endConditionValue: durationMinutes ? runDuration : ((distanceKm ?? 1) - 1) * 1000,
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
	db: Database,
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

		const client = await getGarminClient(db);

		// Format name like Runna
		const name = formatWorkoutName(weekNumber, scheduledDate, type, durationMinutes, distanceKm);

		// Build workout structure
		const workout = buildGarminWorkout(name, description, type, durationMinutes, distanceKm);

		console.log('Pushing workout to Garmin:', name);
		console.log('Scheduled for:', scheduledDate);

		// Use the library's built-in addWorkout method
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const response = await client.addWorkout(workout as any);

		const workoutId = String(response?.workoutId);

		console.log('Created Garmin workout:', workoutId);

		// Save updated tokens
		await saveTokens(db, client);

		// Schedule the workout for the specific date using the library's built-in method
		await scheduleWorkout(client, workoutId, scheduledDate);

		return { success: true, workoutId };
	} catch (err) {
		console.error('Push workout error:', err);
		return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
}

// Schedule a workout for a specific date using the garmin-connect library's HTTP client
async function scheduleWorkout(
	client: GarminClient,
	workoutId: string,
	date: string
): Promise<void> {
	try {
		console.log(`  Scheduling workout ${workoutId} for ${date}...`);

		// The schedule endpoint on connectapi.garmin.com
		const scheduleUrl = `https://connectapi.garmin.com/workout-service/schedule/${workoutId}`;

		// Use the library's internal HTTP client which has OAuth tokens
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const httpClient = (client as any).client;

		await httpClient.post(scheduleUrl, { date });

		console.log(`  ✓ Workout ${workoutId} scheduled for ${date}`);
	} catch (error) {
		console.warn(`  ⚠ Could not schedule workout: ${error instanceof Error ? error.message : 'Unknown'}`);
		console.log(`  📅 Workout ${workoutId} created (manual scheduling may be needed)`);
	}
}

// Delete a workout from Garmin
export async function deleteGarminWorkout(db: Database, workoutId: string): Promise<boolean> {
	try {
		const client = await getGarminClient(db);

		// Use the library's built-in deleteWorkout method
		await client.deleteWorkout({ workoutId });

		console.log('Delete workout', workoutId, ': success');
		return true;
	} catch (err) {
		console.error('Delete workout failed:', err);
		return false;
	}
}

// Delete all OpenCoach workouts from Garmin
export async function deleteAllOpenCoachWorkouts(
	db: Database
): Promise<{ deleted: number; errors: number }> {
	try {
		const client = await getGarminClient(db);

		// Fetch all workouts from Garmin using built-in method
		const workouts = await client.getWorkouts(0, 100);

		if (!workouts || !Array.isArray(workouts)) {
			return { deleted: 0, errors: 0 };
		}

		// Filter to only OpenCoach workouts (start with "W" like Runna format)
		const openCoachWorkouts = workouts.filter(
			(w) =>
				w.workoutName.startsWith('OpenCoach:') ||
				w.workoutName.match(/^W\d+\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/) !== null
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
	} catch (err) {
		console.error('deleteAllOpenCoachWorkouts error:', err);
		return { deleted: 0, errors: 1 };
	}
}

// Push this week's workouts to Garmin (only workouts within next 7 days)
export async function pushWeekToGarmin(
	db: Database
): Promise<{ success: boolean; pushed: number; errors: string[] }> {
	const { getUpcomingPlans, updatePlanGarminId } = await import('./db');

	const plans = await getUpcomingPlans(db);
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
