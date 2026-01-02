import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSetting, setSetting, savePushSubscription, SETTING_KEYS } from '$lib/server/db';
import { generateVapidKeys } from '$lib/server/notifications';

// GET: Get VAPID public key for push subscription
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	let publicKey = await getSetting(db, SETTING_KEYS.VAPID_PUBLIC_KEY);

	// Generate VAPID keys if not exists
	if (!publicKey) {
		const keys = await generateVapidKeys();
		await setSetting(db, SETTING_KEYS.VAPID_PUBLIC_KEY, keys.publicKey);
		await setSetting(db, SETTING_KEYS.VAPID_PRIVATE_KEY, keys.privateKey);
		publicKey = keys.publicKey;
	}

	return json({ publicKey });
};

// POST: Save push subscription
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const subscription = await request.json();

	if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
		throw error(400, 'Invalid push subscription');
	}

	await savePushSubscription(db, subscription);
	await setSetting(db, SETTING_KEYS.PUSH_ENABLED, 'true');

	return json({ success: true });
};

// DELETE: Remove push subscription (unsubscribe)
export const DELETE: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const { endpoint } = await request.json();

	if (!endpoint) {
		throw error(400, 'Endpoint required');
	}

	await db
		.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
		.bind(endpoint)
		.run();

	// Check if any subscriptions remain
	const remaining = await db
		.prepare('SELECT COUNT(*) as count FROM push_subscriptions')
		.first<{ count: number }>();

	if (!remaining?.count) {
		await setSetting(db, SETTING_KEYS.PUSH_ENABLED, 'false');
	}

	return json({ success: true });
};

