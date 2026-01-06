// Service Worker for OpenCoach Push Notifications

const CACHE_NAME = 'opencoach-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
	console.log('[SW] Installing service worker');
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[SW] Activating service worker');
	event.waitUntil(clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
	console.log('[SW] Push received');

	let data = {
		title: 'OpenCoach',
		body: 'New notification',
		icon: '/favicon.svg',
		badge: '/favicon.svg'
	};

	if (event.data) {
		try {
			data = { ...data, ...event.data.json() };
		} catch (e) {
			data.body = event.data.text();
		}
	}

	const options = {
		body: data.body,
		icon: data.icon || '/favicon.svg',
		badge: data.badge || '/favicon.svg',
		tag: data.tag || 'opencoach-notification',
		data: data.data || {},
		vibrate: [100, 50, 100],
		actions: [
			{ action: 'open', title: 'Open App' },
			{ action: 'dismiss', title: 'Dismiss' }
		]
	};

	event.waitUntil(
		self.registration.showNotification(data.title, options)
	);
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
	console.log('[SW] Notification clicked');
	event.notification.close();

	if (event.action === 'dismiss') {
		return;
	}

	// Open the app
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Check if app is already open
			for (const client of clientList) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					return client.focus();
				}
			}
			// Open new window if not
			if (clients.openWindow) {
				return clients.openWindow('/');
			}
		})
	);
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
	console.log('[SW] Notification closed');
});

