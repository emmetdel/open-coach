import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getUserByLogin } from "$lib/server/auth";
import { createUserSession, verifyPassword } from "$lib/server/auth";

const SESSION_DAYS = 30;

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
  const db = locals.db;
  if (!db) {
    return json({ success: false, error: "Database not available" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body?.password) {
    return json(
      { success: false, error: "Email and password are required" },
      { status: 400 },
    );
  }

  const user = await getUserByLogin(db, body.email);
  if (!user || !user.password_hash || !user.password_salt) {
    return json(
      {
        success: false,
        error: "Account not found or needs setup.",
      },
      { status: 401 },
    );
  }

  if (!verifyPassword(body.password, user.password_hash, user.password_salt)) {
    return json({ success: false, error: "Invalid credentials" }, { status: 401 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  const sessionId = await createUserSession(db, user.id, expiresAt);

  cookies.set("oc_session", sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return json({ success: true, user: { id: user.id, name: user.name } });
};
