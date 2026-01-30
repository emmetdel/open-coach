import crypto from "node:crypto";
import type { Database, UserAccount } from "./db";
import {
  createSession,
  deleteSession,
  getSessionById,
  getUserByEmail,
  getUserById,
} from "./db";

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = "sha512";

export function hashPassword(password: string, salt?: string): {
  hash: string;
  salt: string;
} {
  const useSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, useSalt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("hex");
  return { hash, salt: useSalt };
}

export function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): boolean {
  const candidate = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export async function createUserSession(
  db: Database,
  userId: string,
  expiresAt: Date,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await createSession(db, {
    id: sessionId,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
  return sessionId;
}

export async function getSessionUser(
  db: Database,
  sessionId: string,
): Promise<{ user: UserAccount; expired: boolean } | null> {
  const session = await getSessionById(db, sessionId);
  if (!session) return null;
  const expiresAt = new Date(session.expires_at);
  const expired = Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date();
  const user = await getUserById(db, session.user_id);
  if (!user) return null;
  return { user, expired };
}

export async function deleteUserSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await deleteSession(db, sessionId);
}

export async function getUserByLogin(
  db: Database,
  email: string,
): Promise<UserAccount | null> {
  return await getUserByEmail(db, email);
}
