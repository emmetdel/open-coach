import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import crypto from "node:crypto";
import { hashPassword, createUserSession } from "$lib/server/auth";
import { createUser, listUsers, updateUser } from "$lib/server/db";

const SESSION_DAYS = 30;

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
  const db = locals.db;
  if (!db) {
    return json({ success: false, error: "Database not available" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
  } | null;

  if (!body?.name || !body?.email || !body?.password) {
    return json(
      { success: false, error: "Name, email, and password are required" },
      { status: 400 },
    );
  }

  const users = await listUsers(db);
  const normalizedEmail = body.email.toLowerCase();
  const existingUser = users.find((u) => u.email === normalizedEmail);
  const legacyUser = users.find((u) => !u.password_hash);

  if (existingUser && existingUser.password_hash) {
    return json(
      { success: false, error: "An account with this email already exists." },
      { status: 400 },
    );
  }

  const { hash, salt } = hashPassword(body.password);
  let userId: string;

  if (legacyUser) {
    userId = legacyUser.id;
    await updateUser(db, legacyUser.id, {
      name: body.name,
      email: normalizedEmail,
      password_hash: hash,
      password_salt: salt,
    });
  } else {
    userId = crypto.randomUUID();
    await createUser(db, {
      id: userId,
      name: body.name,
      email: normalizedEmail,
      password_hash: hash,
      password_salt: salt,
    });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  const sessionId = await createUserSession(db, userId, expiresAt);

  cookies.set("oc_session", sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return json({ success: true, user: { id: userId, name: body.name } });
};
