// OpenCoach Service Worker
const CACHE_NAME = 'opencoach-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
	'/',
	'/plan',
	'/settings',
	'/manifest.json',
	'/offline.html'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('[SW] Precaching assets');
			return cache.addAll(PRECACHE_ASSETS);
		})
	);
	// Activate immediately
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			);
		})
	);
	// Take control of all pages immediately
	self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
	// Skip non-GET requests
	if (event.request.method !== 'GET') return;

	// Skip API requests (always go to network)
	if (event.request.url.includes('/api/')) return;

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				// Cache successful responses
				if (response.ok) {
					const responseClone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, responseClone);
					});
				}
				return response;
			})
			.catch(async () => {
				// Try cache
				const cachedResponse = await caches.match(event.request);
				if (cachedResponse) {
					return cachedResponse;
				}
				// Return offline page for navigation requests
				if (event.request.mode === 'navigate') {
					return caches.match(OFFLINE_URL);
				}
				return new Response('Offline', { status: 503 });
			})
	);
});

// Push notification event
self.addEventListener('push', (event) => {
	let data = { title: 'OpenCoach', body: 'Time for your run!' };

	if (event.data) {
		try {
			data = event.data.json();
		} catch (e) {
			data.body = event.data.text();
		}
	}

	const options = {
		body: data.body,
		icon: '/icons/android-chrome-192x192.png',
		badge: '/icons/android-chrome-192x192.png',
		vibrate: [200, 100, 200],
		tag: data.tag || 'opencoach-notification',
		renotify: true,
		requireInteraction: data.requireInteraction || false,
		data: {
			url: data.url || '/'
		},
		actions: data.actions || [
			{ action: 'open', title: "Let's go!" },
			{ action: 'dismiss', title: 'Later' }
		]
	};

	event.waitUntil(
		self.registration.showNotification(data.title, options)
	);
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url || '/';

	if (event.action === 'dismiss') {
		return;
	}

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Focus existing window if available
			for (const client of clientList) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			// Open new window
			return clients.openWindow(url);
		})
	);
});

console.log('[SW] Service Worker loaded');
