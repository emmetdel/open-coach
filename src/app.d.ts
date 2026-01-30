// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { LocalDatabase } from "$lib/server/sqlite";
import type { UserAccount } from "$lib/server/db";

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: LocalDatabase;
			user?: UserAccount;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
