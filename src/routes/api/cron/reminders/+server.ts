// Cron handler for run reminders
// Triggered at 7 AM (morning) and 8 PM (evening)

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendRunReminders } from '$lib/server/reminders';
import { hasCompletedSetup } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, url }) => {
	const db = locals.db;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Check if setup is complete
	const isSetup = await hasCompletedSetup(db);
	if (!isSetup) {
		return json({
			success: false,
			message: 'Setup not complete, skipping reminders'
		});
	}

	// Determine if morning or evening based on time or query param
	const hour = new Date().getUTCHours();
	const forceType = url.searchParams.get('type') as 'morning' | 'evening' | null;
	const reminderType = forceType || (hour < 12 ? 'morning' : 'evening');

	try {
		const result = await sendRunReminders(db, reminderType);

		console.log(`${reminderType} reminders: sent ${result.sent}`);

		return json({
			success: true,
			type: reminderType,
			sent: result.sent,
			message: `Sent ${result.sent} ${reminderType} reminder(s)`
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
