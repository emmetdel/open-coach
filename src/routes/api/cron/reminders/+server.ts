// Cron handler for run reminders
// Triggered at 7 AM (morning) and 8 PM (evening)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendRunReminders } from '$lib/server/reminders';
import { hasCompletedSetup, listUsers } from '$lib/server/db';
import { isCronAuthorized } from '$lib/server/cronAuth';

export const GET: RequestHandler = async ({ locals, url, request }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Verify cron secret
	if (!isCronAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Determine if morning or evening based on time or query param
	const hour = new Date().getUTCHours();
	const forceType = url.searchParams.get('type') as 'morning' | 'evening' | null;
	const reminderType = forceType || (hour < 12 ? 'morning' : 'evening');

	try {
		const users = await listUsers(db);
		let sent = 0;

		for (const user of users) {
			const isSetup = await hasCompletedSetup(db, user.id);
			if (!isSetup) {
				continue;
			}
			const result = await sendRunReminders(db, user.id, reminderType);
			sent += result.sent;
		}

		return json({
			success: true,
			type: reminderType,
			sent,
			message: `Sent ${sent} ${reminderType} reminder(s)`
		});
	} catch (err) {
		console.error('Reminder cron failed:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{
				success: false,
				error: message
			},
			{ status: 500 }
		);
	}
};
