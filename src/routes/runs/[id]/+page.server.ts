import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRunByActivityId, type Run } from '$lib/server/db';
import { formatDistance, formatDuration, calculatePace } from '$lib/server/garmin';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const run = await getRunByActivityId(db, locals.user.id, params.id);

	if (!run) {
		throw error(404, 'Run not found');
	}

	return {
		run: {
			...run,
			dateFormatted: new Date(run.date).toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric'
			}),
			distance: formatDistance(run.distance_meters),
			duration: formatDuration(run.duration_seconds),
			pace: calculatePace(run.distance_meters, run.duration_seconds)
		}
	};
};
