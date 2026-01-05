// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { LocalDatabase } from '$lib/server/sqlite';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: LocalDatabase;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
