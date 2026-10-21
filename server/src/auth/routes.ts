import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import type { AppConfig } from "../config";
import { AuthRateLimiters } from "./limits";
import {
  createSession,
  deleteAllUserSessions,
  deleteSession,
  findSession,
  getCookieName,
  type Principal,
} from "./sessions";
import { AuthError } from "./policy";
import { validateOriginAndHeaders, verifyCsrfToken } from "./csrf";
import { getDummyHash, validateNewPassword, verifyPasswordThrottled } from "./passwords";
import { ARGON2_OPTIONS, validateUsername } from "../accounts";
import argon2 from "argon2";

export interface AuthRoutesOptions {
  config: AppConfig;
  db: Database.Database;
  rateLimiters: AuthRateLimiters;
  nowMs?: () => number;
}

export function getPrincipalFromRequest(
  req: FastifyRequest,
  db: Database.Database,
  cookieName: string,
  now: number
): Principal | null {
  const token = req.cookies[cookieName];
  if (!token || typeof token !== "string") {
    return null;
  }
  return findSession(db, token, now);
}

function hasExactKeys(obj: object, allowed: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return allowed.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: AuthRoutesOptions
) => {
  const { config, db, rateLimiters, nowMs = Date.now } = opts;
  const cookieName = getCookieName(config.nodeEnv);

  // Hook to enforce API headers on all /api/auth routes
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Vary", "Cookie, Origin");
    reply.header("X-Content-Type-Options", "nosniff");
  });

  // GET /api/auth/session
  fastify.get("/session", async (request, reply) => {
    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());

    if (!principal) {
      return reply.code(200).send({ authenticated: false });
    }

    return reply.code(200).send({
      authenticated: true,
      user: principal.user,
      expiresAt: new Date(principal.expiresAt).toISOString(),
      csrfToken: principal.csrfToken,
    });
  });

  // POST /api/auth/login
  fastify.post("/login", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new AuthError(415, "UNSUPPORTED_MEDIA_TYPE", "Требуется application/json");
    }

    // Check if already authenticated
    const existing = getPrincipalFromRequest(request, db, cookieName, nowMs());
    if (existing) {
      throw new AuthError(409, "ALREADY_AUTHENTICATED", "Сессия уже активна. Сначала выполните выход");
    }

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректное тело запроса");
    }
    if (!hasExactKeys(body, ["username", "password"])) {
      throw new AuthError(400, "INVALID_REQUEST", "Недопустимые поля в запросе");
    }

    const { username: rawUsername, password } = body as { username: unknown; password: unknown };
    if (typeof rawUsername !== "string" || typeof password !== "string") {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректный логин или пароль");
    }

    let normalizedUsername: string;
    try {
      normalizedUsername = validateUsername(rawUsername);
    } catch {
      normalizedUsername = rawUsername.trim().toLowerCase();
    }

    // Rate limiting check
    const clientIp = request.ip || "127.0.0.1";
    const limitResult = await rateLimiters.checkLogin(clientIp, normalizedUsername);
    if (!limitResult.allowed) {
      reply.header("Retry-After", limitResult.retryAfter || 1);
      throw new AuthError(429, "TOO_MANY_ATTEMPTS", "Слишком много попыток входа. Попробуйте позже");
    }

    // Lookup user in DB
    const userRow = db
      .prepare("SELECT id, username, role, password_hash, enabled FROM users WHERE username = ?")
      .get(normalizedUsername) as
      | { id: string; username: string; role: "patient" | "staff"; password_hash: string; enabled: number }
      | undefined;

    if (!userRow || userRow.enabled !== 1) {
      // Dummy check to mitigate timing discrepancies
      const dummyHash = await getDummyHash();
      const dummyRes = await verifyPasswordThrottled(dummyHash, password);
      if (dummyRes.rateLimited) {
        reply.header("Retry-After", dummyRes.retryAfter || 1);
        throw new AuthError(429, "TOO_MANY_ATTEMPTS", "Сервер перегружен проверкой паролей. Повторите попытку через секунду");
      }
      throw new AuthError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
    }

    // Verify candidate password with Argon2
    const verifyRes = await verifyPasswordThrottled(userRow.password_hash, password);
    if (verifyRes.rateLimited) {
      reply.header("Retry-After", verifyRes.retryAfter || 1);
      throw new AuthError(429, "TOO_MANY_ATTEMPTS", "Сервер перегружен проверкой паролей. Повторите попытку через секунду");
    }

    if (!verifyRes.valid) {
      throw new AuthError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
    }

    // In a transaction, re-verify user has not changed and create session
    const now = nowMs();
    let session: { token: string; csrfToken: string; expiresAt: number } | null = null;

    const loginTx = db.transaction(() => {
      const freshUser = db
        .prepare("SELECT id, username, role, password_hash, enabled FROM users WHERE id = ?")
        .get(userRow.id) as
        | { id: string; username: string; role: "patient" | "staff"; password_hash: string; enabled: number }
        | undefined;

      if (
        !freshUser ||
        freshUser.enabled !== 1 ||
        freshUser.password_hash !== userRow.password_hash ||
        freshUser.role !== userRow.role
      ) {
        throw new AuthError(401, "INVALID_CREDENTIALS", "Учётная запись была изменена. Повторите вход");
      }

      session = createSession(db, freshUser.id, now);
    });

    loginTx();

    reply.setCookie(cookieName, session!.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 28800,
      secure: config.nodeEnv === "production",
    });

    return reply.code(200).send({
      authenticated: true,
      user: {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
      },
      expiresAt: new Date(session!.expiresAt).toISOString(),
      csrfToken: session!.csrfToken,
    });
  });

  // POST /api/auth/logout
  fastify.post("/logout", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());

    if (principal) {
      // Synchronizer CSRF token check
      const csrfHeader = request.headers["x-csrf-token"];
      if (!verifyCsrfToken(principal.csrfToken, csrfHeader)) {
        throw new AuthError(403, "CSRF_REJECTED", "Недействительный CSRF-токен");
      }

      // Check expected account header
      const expectedAccount = request.headers["x-marshrut-account"];
      if (!expectedAccount) {
        throw new AuthError(400, "INVALID_REQUEST", "Заголовок X-Marshrut-Account обязателен");
      }
      if (expectedAccount !== principal.user.id) {
        throw new AuthError(409, "ACCOUNT_CHANGED", "Текущий аккаунт не совпадает с активной сессией");
      }

      const token = request.cookies[cookieName]!;
      deleteSession(db, token);
    }

    reply.clearCookie(cookieName, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
    });

    return reply.code(204).send();
  });

  // POST /api/auth/password
  fastify.post("/password", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new AuthError(415, "UNSUPPORTED_MEDIA_TYPE", "Требуется application/json");
    }

    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());
    if (!principal) {
      throw new AuthError(401, "AUTH_REQUIRED", "Требуется авторизация");
    }

    // CSRF verification
    const csrfHeader = request.headers["x-csrf-token"];
    if (!verifyCsrfToken(principal.csrfToken, csrfHeader)) {
      throw new AuthError(403, "CSRF_REJECTED", "Недействительный CSRF-токен");
    }

    // Expected account header
    const expectedAccount = request.headers["x-marshrut-account"];
    if (!expectedAccount) {
      throw new AuthError(400, "INVALID_REQUEST", "Заголовок X-Marshrut-Account обязателен");
    }
    if (expectedAccount !== principal.user.id) {
      throw new AuthError(409, "ACCOUNT_CHANGED", "Текущий аккаунт не совпадает с активной сессией");
    }

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректное тело запроса");
    }
    if (!hasExactKeys(body, ["currentPassword", "newPassword"])) {
      throw new AuthError(400, "INVALID_REQUEST", "Недопустимые поля в запросе");
    }

    const { currentPassword, newPassword } = body as { currentPassword: unknown; newPassword: unknown };
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      throw new AuthError(400, "INVALID_REQUEST", "Пароли должны быть строками");
    }

    let validatedNewPassword: string;
    try {
      validatedNewPassword = validateNewPassword(newPassword);
    } catch (err) {
      throw new AuthError(400, "INVALID_REQUEST", (err as Error).message);
    }

    // Check rate limit on password changes
    const limitResult = await rateLimiters.checkPasswordChange(principal.user.id);
    if (!limitResult.allowed) {
      reply.header("Retry-After", limitResult.retryAfter || 1);
      throw new AuthError(429, "TOO_MANY_ATTEMPTS", "Слишком много попыток смены пароля. Попробуйте позже");
    }

    // Read current user password hash
    const userRow = db
      .prepare("SELECT id, password_hash, enabled FROM users WHERE id = ?")
      .get(principal.user.id) as { id: string; password_hash: string; enabled: number } | undefined;

    if (!userRow || userRow.enabled !== 1) {
      throw new AuthError(401, "AUTH_REQUIRED", "Учётная запись недоступна");
    }

    // Verify current password
    const verifyRes = await verifyPasswordThrottled(userRow.password_hash, currentPassword);
    if (verifyRes.rateLimited) {
      reply.header("Retry-After", verifyRes.retryAfter || 1);
      throw new AuthError(429, "TOO_MANY_ATTEMPTS", "Сервер перегружен проверкой паролей. Повторите попытку через секунду");
    }

    if (!verifyRes.valid) {
      // Do not terminate session, return 400
      throw new AuthError(400, "CURRENT_PASSWORD_INVALID", "Неверный текущий пароль");
    }

    // Hash new password
    const newHash = await argon2.hash(validatedNewPassword, ARGON2_OPTIONS);

    // Atomically re-verify user state and revoke all sessions
    const updatePasswordTx = db.transaction(() => {
      const freshUser = db
        .prepare("SELECT id, password_hash, enabled FROM users WHERE id = ?")
        .get(principal.user.id) as { id: string; password_hash: string; enabled: number } | undefined;

      if (!freshUser || freshUser.enabled !== 1 || freshUser.password_hash !== userRow.password_hash) {
        throw new AuthError(409, "ACCOUNT_CHANGED", "Параметры учётной записи изменились. Войдите заново");
      }

      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, principal.user.id);
      deleteAllUserSessions(db, principal.user.id);
    });

    updatePasswordTx();

    reply.clearCookie(cookieName, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
    });

    return reply.code(204).send();
  });
};
