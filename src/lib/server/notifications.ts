// Notification service for Web Push and Email
import { getSetting, getSettings, getPushSubscriptions, deletePushSubscription, SETTING_KEYS } from './db';
import type { Run } from './db';
import type { LocalDatabase } from './sqlite';
import { formatDistance } from './garmin';

type Database = LocalDatabase;

// Web Push notification payload
interface PushPayload {
	title: string;
	body: string;
	icon?: string;
	badge?: string;
	tag?: string;
	data?: Record<string, unknown>;
}

// Send Web Push notification to all subscriptions
export async function sendPushNotification(
	db: Database,
	payload: PushPayload
): Promise<{ sent: number; failed: number }> {
	const settings = await getSettings(db, [
		SETTING_KEYS.PUSH_ENABLED,
		SETTING_KEYS.VAPID_PUBLIC_KEY,
		SETTING_KEYS.VAPID_PRIVATE_KEY
	]);

	if (settings[SETTING_KEYS.PUSH_ENABLED] !== 'true') {
		return { sent: 0, failed: 0 };
	}

	const vapidPublicKey = settings[SETTING_KEYS.VAPID_PUBLIC_KEY];
	const vapidPrivateKey = settings[SETTING_KEYS.VAPID_PRIVATE_KEY];

	if (!vapidPublicKey || !vapidPrivateKey) {
		console.error('VAPID keys not configured');
		return { sent: 0, failed: 0 };
	}

	const subscriptions = await getPushSubscriptions(db);
	let sent = 0;
	let failed = 0;

	for (const sub of subscriptions) {
		try {
			const success = await sendWebPush(
				{
					endpoint: sub.endpoint,
					keys: { p256dh: sub.p256dh, auth: sub.auth }
				},
				payload,
				vapidPublicKey,
				vapidPrivateKey
			);

			if (success) {
				sent++;
			} else {
				// Subscription might be expired, remove it
				await deletePushSubscription(db, sub.endpoint);
				failed++;
			}
		} catch (error) {
			console.error('Failed to send push notification:', error);
			failed++;
		}
	}

	return { sent, failed };
}

// Low-level Web Push sending using the Web Push protocol
async function sendWebPush(
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	payload: PushPayload,
	vapidPublicKey: string,
	vapidPrivateKey: string
): Promise<boolean> {
	// For Web Push, we need to implement the VAPID signing and encryption
	// This is a simplified version - in production you'd use a library
	
	const body = JSON.stringify(payload);
	
	// Create JWT for VAPID
	const jwt = await createVapidJwt(subscription.endpoint, vapidPublicKey, vapidPrivateKey);
	
	// Encrypt the payload using the subscription keys
	const { body: encrypted, salt, publicKey } = await encryptPayload(
		body,
		subscription.keys.p256dh,
		subscription.keys.auth
	);
	
	const response = await fetch(subscription.endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Encoding': 'aes128gcm',
			'Encryption': `salt=${salt}`,
			'Crypto-Key': `dh=${publicKey};p256ecdsa=${vapidPublicKey}`,
			'TTL': '86400',
			'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`
		},
		body: encrypted
	});

	if (response.status === 410 || response.status === 404) {
		// Subscription expired or not found
		return false;
	}

	return response.ok;
}

// Create VAPID JWT token
async function createVapidJwt(
	endpoint: string,
	publicKey: string,
	privateKey: string
): Promise<string> {
	const audience = new URL(endpoint).origin;
	const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

	const header = { typ: 'JWT', alg: 'ES256' };
	const payload = {
		aud: audience,
		exp: expiry,
		sub: 'mailto:notifications@opencoach.run'
	};

	const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

	const data = `${headerB64}.${payloadB64}`;
	
	// Import the private key and sign
	const keyData = base64UrlToArrayBuffer(privateKey);
	const key = await crypto.subtle.importKey(
		'pkcs8',
		keyData,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(data)
	);

	const signatureB64 = arrayBufferToBase64Url(signature);
	return `${data}.${signatureB64}`;
}

// Encrypt payload for Web Push (simplified - uses aes128gcm)
async function encryptPayload(
	payload: string,
	p256dh: string,
	auth: string
): Promise<{ body: ArrayBuffer; salt: string; publicKey: string }> {
	// Generate a random salt
	const salt = crypto.getRandomValues(new Uint8Array(16));
	
	// Import subscriber's public key
	const subscriberPublicKey = base64UrlToArrayBuffer(p256dh);
	const authSecret = base64UrlToArrayBuffer(auth);
	
	// Generate ephemeral key pair
	const ephemeralKeyPair = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveBits']
	);
	
	// Import subscriber's public key for ECDH
	const subscriberKey = await crypto.subtle.importKey(
		'raw',
		subscriberPublicKey,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	
	// Derive shared secret
	const sharedSecret = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: subscriberKey },
		ephemeralKeyPair.privateKey,
		256
	);
	
	// Derive encryption key using HKDF
	const ikm = await crypto.subtle.importKey(
		'raw',
		sharedSecret,
		'HKDF',
		false,
		['deriveBits']
	);
	
	const contentEncryptionKey = await crypto.subtle.deriveBits(
		{
			name: 'HKDF',
			salt: authSecret,
			info: new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
			hash: 'SHA-256'
		},
		ikm,
		128
	);
	
	const nonce = await crypto.subtle.deriveBits(
		{
			name: 'HKDF',
			salt: salt,
			info: new TextEncoder().encode('Content-Encoding: nonce\0'),
			hash: 'SHA-256'
		},
		ikm,
		96
	);
	
	// Encrypt with AES-GCM
	const aesKey = await crypto.subtle.importKey(
		'raw',
		contentEncryptionKey,
		'AES-GCM',
		false,
		['encrypt']
	);
	
	const paddedPayload = new Uint8Array([...new TextEncoder().encode(payload), 2]); // Add padding delimiter
	
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce },
		aesKey,
		paddedPayload
	);
	
	// Export ephemeral public key
	const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
	
	// Build the final message: salt + rs + idlen + keyid + encrypted
	const rs = new Uint8Array([0, 0, 16, 0]); // Record size 4096
	const keyIdLen = new Uint8Array([65]); // Length of ephemeral public key
	
	const result = new Uint8Array(
		salt.length + 4 + 1 + (ephemeralPublicKey as ArrayBuffer).byteLength + encrypted.byteLength
	);
	
	let offset = 0;
	result.set(salt, offset); offset += salt.length;
	result.set(rs, offset); offset += 4;
	result.set(keyIdLen, offset); offset += 1;
	result.set(new Uint8Array(ephemeralPublicKey as ArrayBuffer), offset); offset += (ephemeralPublicKey as ArrayBuffer).byteLength;
	result.set(new Uint8Array(encrypted), offset);
	
	return {
		body: result.buffer,
		salt: arrayBufferToBase64Url(sliceArrayBuffer(salt)),
		publicKey: arrayBufferToBase64Url(ephemeralPublicKey as ArrayBuffer)
	};
}

// Helper functions for base64url encoding/decoding
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(base64 + padding);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function sliceArrayBuffer(view: Uint8Array): ArrayBuffer {
	return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

// Generate VAPID key pair
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
	const keyPair = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign']
	);

	const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
	const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

	return {
		publicKey: arrayBufferToBase64Url(publicKey),
		privateKey: arrayBufferToBase64Url(privateKey)
	};
}

// Send email notification (placeholder - implement with nodemailer or similar for Docker)
export async function sendEmailNotification(
	db: Database,
	recipientEmail: string | undefined,
	subject: string,
	htmlBody: string,
	_unused?: unknown
): Promise<boolean> {
	const settings = await getSettings(db, [
		SETTING_KEYS.EMAIL_ENABLED,
		SETTING_KEYS.NOTIFICATION_EMAIL
	]);

	if (settings[SETTING_KEYS.EMAIL_ENABLED] !== 'true') {
		return false;
	}

	const email = recipientEmail || settings[SETTING_KEYS.NOTIFICATION_EMAIL];
	if (!email) {
		return false;
	}

	// TODO: Implement email sending with nodemailer or similar
	// For now, just log it
	console.log(`[Email] Would send to ${email}: ${subject}`);
	console.log(`[Email] Body: ${htmlBody.slice(0, 200)}...`);
	
	return true;
}

// Notification: Run synced
export async function notifyRunSynced(
	db: Database,
	run: Run
): Promise<void> {
	const settings = await getSettings(db, [SETTING_KEYS.NOTIFY_ON_SYNC]);
	if (settings[SETTING_KEYS.NOTIFY_ON_SYNC] !== 'true') {
		return;
	}

	const distance = formatDistance(run.distance_meters);
	const date = new Date(run.date).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});

	// Send push notification
	await sendPushNotification(db, {
		title: 'Run Synced! 🏃',
		body: `${distance} on ${date}. ${run.ai_feedback?.slice(0, 100) || 'Great job!'}`,
		tag: 'run-synced',
		data: { runId: run.garmin_activity_id }
	});

	// Send email notification
	await sendEmailNotification(
		db,
		undefined,
		`OpenCoach: New Run Synced - ${distance}`,
		`
		<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
			<h2 style="color: #22c55e;">🏃 Run Synced!</h2>
			<p><strong>Date:</strong> ${date}</p>
			<p><strong>Distance:</strong> ${distance}</p>
			${run.ai_feedback ? `<blockquote style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px; margin: 16px 0;">${run.ai_feedback}</blockquote>` : ''}
			<p style="color: #666; font-size: 14px;">Mental health over metrics. Every run counts.</p>
		</div>
		`
	);
}

// Notification: Missed run
export async function notifyMissedRun(
	db: Database,
	scheduledDate: string
): Promise<void> {
	const settings = await getSettings(db, [SETTING_KEYS.NOTIFY_ON_MISSED]);
	if (settings[SETTING_KEYS.NOTIFY_ON_MISSED] !== 'true') {
		return;
	}

	const date = new Date(scheduledDate).toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});

	// Send push notification
	await sendPushNotification(db, {
		title: 'Missed Run Rescheduled',
		body: `Your ${date} run has been moved. No pressure - life happens!`,
		tag: 'missed-run'
	});

	// Send email notification
	await sendEmailNotification(
		db,
		undefined,
		`OpenCoach: Run Rescheduled`,
		`
		<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
			<h2 style="color: #f97316;">Run Rescheduled</h2>
			<p>Your run scheduled for <strong>${date}</strong> has been automatically rescheduled.</p>
			<p>No pressure - life happens! What matters is getting back out there when you can.</p>
			<p style="color: #666; font-size: 14px;">Mental health over metrics. Every run counts.</p>
		</div>
		`
	);
}
