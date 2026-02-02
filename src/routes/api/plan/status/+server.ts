import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePlanStatus } from '$lib/server/db';

interface StatusChangeRequest {
	planId: string;
	newStatus: 'Pending' | 'Completed';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const db = locals.db;
	if (!db || !locals.user) {
		return json({ success: false, error: 'Database not available' }, { status: 500 });
	}
	const userId = locals.user.id;

	try {
		const body: StatusChangeRequest = await request.json();
		const { planId, newStatus } = body;

		if (!planId || !newStatus) {
			return json({ success: false, error: 'Missing planId or newStatus' }, { status: 400 });
		}

		if (newStatus !== 'Pending' && newStatus !== 'Completed') {
			return json({ success: false, error: 'Invalid status' }, { status: 400 });
		}

		// Update the status
		await updatePlanStatus(db, userId, planId, newStatus);

		return json({
			success: true,
			message: `Run marked as ${newStatus.toLowerCase()}`
		});
	} catch (err) {
		console.error('Status change error:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Failed to update status'
			},
			{ status: 500 }
		);
	}
};
