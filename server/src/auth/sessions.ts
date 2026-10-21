import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { PublicUser, UserRole } from "../accounts";

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours (28800 seconds)

export interface Principal {
  user: PublicUser;
  tokenHash: string;
  csrfToken: string;
  expiresAt: number;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: number;
}

export function getCookieName(nodeEnv: "development" | "test" | "production"): string {
  return nodeEnv === "production" ? "__Host-marshrut-session" : "marshrut-session";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(
  db: Database.Database,
  userId: string,
  now: number
): CreatedSession {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const csrfToken = randomBytes(32).toString("hex");
  const expiresAt = now + SESSION_DURATION_MS;

  const createTx = db.transaction(() => {
    // Purge expired sessions
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);

    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).run(tokenHash, userId, csrfToken, now, expiresAt);
  });

  createTx();

  return { token, csrfToken, expiresAt };
}

export function findSession(
  db: Database.Database,
  token: string,
  now: number
): Principal | null {
  const tokenHash = hashToken(token);

  const row = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at,
              u.username, u.role, u.enabled
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.enabled = 1`
    )
    .get(tokenHash, now) as
    | {
        token_hash: string;
        user_id: string;
        csrf_token: string;
        expires_at: number;
        username: string;
        role: UserRole;
        enabled: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
    },
    tokenHash: row.token_hash,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
  };
}

export function deleteSession(db: Database.Database, token: string): void {
  const tokenHash = hashToken(token);
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteAllUserSessions(db: Database.Database, userId: string): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
