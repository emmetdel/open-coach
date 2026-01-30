// Server hooks - runs on every request
import type { Handle } from "@sveltejs/kit";
import { getSQLiteDatabase } from "$lib/server/sqlite";
import { startCronJobs } from "$lib/server/cron";
import { deleteSession, getSessionById, getUserById, listUsers } from "$lib/server/db";

// Start cron jobs once when server starts
let cronStarted = false;
if (!cronStarted && typeof process !== 'undefined') {
	cronStarted = true;
	// Delay to ensure server is ready
	setTimeout(() => {
		if (process.env.ENABLE_CRON !== 'false') {
			startCronJobs();
		}
	}, 1000);
}

export const handle: Handle = async ({ event, resolve }) => {
	// Inject database into locals for all routes
	event.locals.db = getSQLiteDatabase();

	const pathname = event.url.pathname;
	const isPublicRoute =
		pathname.startsWith("/api/cron") ||
		pathname.startsWith("/api/auth") ||
		pathname === "/login" ||
		pathname === "/signup" ||
		pathname.startsWith("/icons") ||
		pathname.startsWith("/_app") ||
		pathname === "/sw.js" ||
		pathname === "/manifest.webmanifest" ||
		pathname === "/favicon.ico";

	const sessionId = event.cookies.get("oc_session");
	if (sessionId) {
		const session = await getSessionById(event.locals.db, sessionId);
		if (session) {
			const expiresAt = new Date(session.expires_at);
			if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
				await deleteSession(event.locals.db, sessionId);
				event.cookies.delete("oc_session", { path: "/" });
			} else {
				const user = await getUserById(event.locals.db, session.user_id);
				if (user) {
					event.locals.user = user;
				}
			}
		}
	}

	if (!event.locals.user && !isPublicRoute) {
		const users = await listUsers(event.locals.db);
		if (pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (users.length === 0 || users.every((u) => !u.password_hash)) {
			return new Response(null, {
				status: 302,
				headers: { Location: "/signup" },
			});
		}
		return new Response(null, {
			status: 302,
			headers: { Location: "/login" },
		});
	}

	return resolve(event);
};
