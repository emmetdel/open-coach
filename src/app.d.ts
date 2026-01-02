// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				EMAIL?: {
					send(message: EmailMessage): Promise<void>;
				};
			};
			context: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}

	// Cloudflare Email Message
	class EmailMessage {
		constructor(from: string, to: string, raw: string);
		from: string;
		to: string;
		raw: string;
	}
}

export {};
