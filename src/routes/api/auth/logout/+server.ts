import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteUserSession } from "$lib/server/auth";

export const POST: RequestHandler = async ({ locals, cookies }) => {
  const db = locals.db;
  if (!db) {
    return json({ success: false, error: "Database not available" }, { status: 500 });
  }

  const sessionId = cookies.get("oc_session");
  if (sessionId) {
    await deleteUserSession(db, sessionId);
    cookies.delete("oc_session", { path: "/" });
  }

  return json({ success: true });
};
