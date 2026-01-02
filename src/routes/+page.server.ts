import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRecentRuns, getConsistencyStats, hasCompletedSetup } from '$lib/server/db';
import { formatDistance, formatDuration, calculatePace } from '$lib/server/garmin';

export interface RunDisplay {
	garmin_activity_id: string;
	date: string;
	dateFormatted: string;
	distance: string;
	duration: string;
	pace: string;
	avg_hr: number | null;
	ai_feedback: string | null;
}

export interface WeekStats {
	week: string;
	count: number;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw new Error('Database not available');
	}

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db);
	if (!isSetup) {
		throw redirect(307, '/setup');
	}

	// Fetch data in parallel
	const [runs, weeklyStats] = await Promise.all([
		getRecentRuns(db, 10),
		getConsistencyStats(db, 8)
	]);

	// Transform runs for display
	const runsDisplay: RunDisplay[] = runs.map((run) => ({
		garmin_activity_id: run.garmin_activity_id,
		date: run.date,
		dateFormatted: new Date(run.date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		}),
		distance: formatDistance(run.distance_meters),
		duration: formatDuration(run.duration_seconds),
		pace: calculatePace(run.distance_meters, run.duration_seconds),
		avg_hr: run.avg_hr,
		ai_feedback: run.ai_feedback
	}));

	// Calculate total stats
	const totalRuns = runs.length;
	const totalDistance = runs.reduce((sum, run) => sum + run.distance_meters, 0);
	const avgWeeklyRuns = weeklyStats.length > 0
		? weeklyStats.reduce((sum, w) => sum + w.count, 0) / weeklyStats.length
		: 0;

	return {
		runs: runsDisplay,
		weeklyStats,
		stats: {
			totalRuns,
			totalDistance: formatDistance(totalDistance),
			avgWeeklyRuns: avgWeeklyRuns.toFixed(1)
		}
	};
};

