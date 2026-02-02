import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { LocalDatabase } from '$lib/server/sqlite';

interface UpdateRunPayload {
	date?: string;
	distance_km?: number;
	duration_minutes?: number;
	avg_hr?: number | null;
}

// GET: Get a single run
export const GET: RequestHandler = async ({ params, locals }) => {
	const db = locals.db as LocalDatabase;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	const run = await db
		.prepare('SELECT * FROM runs WHERE user_id = ? AND garmin_activity_id = ?')
		.bind(userId, params.id)
		.first();

	if (!run) {
		throw error(404, 'Run not found');
	}

	return json({ run });
};

// PATCH: Update a run
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const db = locals.db as LocalDatabase;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	const payload: UpdateRunPayload = await request.json();
	const runId = params.id;

	// Check if run exists
	const existing = await db
		.prepare('SELECT * FROM runs WHERE user_id = ? AND garmin_activity_id = ?')
		.bind(userId, runId)
		.first();

	if (!existing) {
		throw error(404, 'Run not found');
	}

	// Build update query dynamically based on provided fields
	if (payload.date) {
		await db.prepare('UPDATE runs SET date = ? WHERE user_id = ? AND garmin_activity_id = ?')
			.bind(payload.date, userId, runId)
			.run();
	}

	if (payload.distance_km !== undefined) {
		await db.prepare('UPDATE runs SET distance_meters = ? WHERE user_id = ? AND garmin_activity_id = ?')
			.bind(Math.round(payload.distance_km * 1000), userId, runId)
			.run();
	}

	if (payload.duration_minutes !== undefined) {
		await db.prepare('UPDATE runs SET duration_seconds = ? WHERE user_id = ? AND garmin_activity_id = ?')
			.bind(Math.round(payload.duration_minutes * 60), userId, runId)
			.run();
	}

	if (payload.avg_hr !== undefined) {
		await db.prepare('UPDATE runs SET avg_hr = ? WHERE user_id = ? AND garmin_activity_id = ?')
			.bind(payload.avg_hr, userId, runId)
			.run();
	}

	return json({
		success: true,
		message: 'Run updated successfully'
	});
};

// DELETE: Delete a run
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const db = locals.db as LocalDatabase;
	if (!db || !locals.user) {
		throw error(500, 'Database not available');
	}
	const userId = locals.user.id;

	const runId = params.id;

	// Check if run exists
	const existing = await db
		.prepare('SELECT * FROM runs WHERE user_id = ? AND garmin_activity_id = ?')
		.bind(userId, runId)
		.first();

	if (!existing) {
		throw error(404, 'Run not found');
	}

	// Delete the run
	await db.prepare('DELETE FROM runs WHERE user_id = ? AND garmin_activity_id = ?')
		.bind(userId, runId)
		.run();

	return json({
		success: true,
		message: 'Run deleted successfully'
	});
};
