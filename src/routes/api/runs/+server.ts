import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { insertRun, updateRunFeedback, getRecentRuns, getRunByActivityId } from '$lib/server/db';
import { analyzeRun } from '$lib/server/coach';

export interface ManualRunPayload {
	date: string;
	distance_km: number;
	duration_minutes: number;
	avg_hr?: number;
	max_hr?: number;
}

export interface ImportRunPayload {
	garmin_activity_id: string;
	date: string;
	distance_meters: number;
	duration_seconds: number;
	avg_hr?: number | null;
	max_hr?: number | null;
}

export interface BulkImportPayload {
	runs: ImportRunPayload[];
}

// GET: List recent runs
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const runs = await getRecentRuns(db, 20);
	return json({ runs });
};

// POST: Add a manual run
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const payload = (await request.json()) as ManualRunPayload;

	// Validate
	if (!payload.date || !payload.distance_km || !payload.duration_minutes) {
		throw error(400, 'Date, distance, and duration are required');
	}

	// Generate a unique ID for manual entries
	const activityId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	const run = {
		garmin_activity_id: activityId,
		date: payload.date,
		distance_meters: Math.round(payload.distance_km * 1000),
		duration_seconds: Math.round(payload.duration_minutes * 60),
		avg_hr: payload.avg_hr ? Math.round(payload.avg_hr) : null,
		max_hr: payload.max_hr ? Math.round(payload.max_hr) : null,
		stress_score: null,
		ai_feedback: null
	};

	// Insert run
	await insertRun(db, run);

	// Get AI feedback
	try {
		const feedback = await analyzeRun(db, run, platform?.env);
		await updateRunFeedback(db, activityId, feedback);
	} catch (e) {
		console.error('Failed to get AI feedback:', e);
	}

	return json({
		success: true,
		message: 'Run added successfully',
		activityId
	});
};

// PUT: Bulk import runs (from Garmin sync script)
export const PUT: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const payload = (await request.json()) as BulkImportPayload;

	if (!payload.runs || !Array.isArray(payload.runs)) {
		throw error(400, 'runs array is required');
	}

	let imported = 0;
	let skipped = 0;

	for (const run of payload.runs) {
		// Skip if already exists
		const existing = await getRunByActivityId(db, run.garmin_activity_id);
		if (existing) {
			skipped++;
			continue;
		}

		const runData = {
			garmin_activity_id: run.garmin_activity_id,
			date: run.date,
			distance_meters: run.distance_meters,
			duration_seconds: run.duration_seconds,
			avg_hr: run.avg_hr ?? null,
			max_hr: run.max_hr ?? null,
			stress_score: null,
			ai_feedback: null
		};

		await insertRun(db, runData);
		imported++;

		// Get AI feedback (don't block on this)
		analyzeRun(db, runData, platform?.env)
			.then((feedback) => updateRunFeedback(db, run.garmin_activity_id, feedback))
			.catch((e) => console.error('Failed to get AI feedback:', e));
	}

	return json({
		success: true,
		message: `Imported ${imported} runs, skipped ${skipped} duplicates`,
		imported,
		skipped
	});
};

