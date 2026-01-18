import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.db) {
    return json({ ok: false, error: "Database not available" }, { status: 500 });
  }

  return json({ ok: true });
};
