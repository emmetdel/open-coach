import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { isCronAuthorized } from "$lib/server/cronAuth";

export const GET: RequestHandler = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return json({ ok: true });
};
