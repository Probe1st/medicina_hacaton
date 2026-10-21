import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import type { AppConfig } from "../config";
import { getCookieName, type Principal } from "../auth/sessions";
import { AuthError, requirePermission } from "../auth/policy";
import { validateOriginAndHeaders, verifyCsrfToken } from "../auth/csrf";
import { getPrincipalFromRequest } from "../auth/routes";
import { getStateSnapshot, resetStateSnapshot, saveStateSnapshot } from "./repository";
import { validateAndBuildDomainAction, validateTimeZone } from "./commands";
import { reduceDemo } from "../../../web/src/domain/reducer";
import type { StateSnapshot } from "../../../web/src/domain/authTypes";

export interface StateRoutesOptions {
  config: AppConfig;
  db: Database.Database;
  nowMs?: () => number;
}

function hasExactKeys(obj: object, allowed: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return allowed.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function checkExpectedAccount(req: FastifyRequest, principal: Principal): void {
  const expectedAccount = req.headers["x-marshrut-account"];
  if (!expectedAccount) {
    throw new AuthError(400, "INVALID_REQUEST", "Заголовок X-Marshrut-Account обязателен");
  }
  if (expectedAccount !== principal.user.id) {
    throw new AuthError(409, "ACCOUNT_CHANGED", "Текущий аккаунт не совпадает с сессией");
  }
}

function checkCsrf(req: FastifyRequest, principal: Principal): void {
  const csrfHeader = req.headers["x-csrf-token"];
  if (!verifyCsrfToken(principal.csrfToken, csrfHeader)) {
    throw new AuthError(403, "CSRF_REJECTED", "Недействительный CSRF-токен");
  }
}

export const stateRoutes: FastifyPluginAsync<StateRoutesOptions> = async (
  fastify,
  opts
) => {
  const { config, db, nowMs = Date.now } = opts;
  const cookieName = getCookieName(config.nodeEnv);

  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Vary", "Cookie, Origin");
    reply.header("X-Content-Type-Options", "nosniff");
  });

  // GET /api/me/state
  fastify.get("/state", async (request, reply) => {
    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());
    requirePermission(principal, "state:read:self");
    checkExpectedAccount(request, principal);

    const snapshot = getStateSnapshot(db, principal.user.id);
    return reply.code(200).send(snapshot);
  });

  // POST /api/me/actions
  fastify.post("/actions", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new AuthError(415, "UNSUPPORTED_MEDIA_TYPE", "Требуется application/json");
    }

    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());
    requirePermission(principal, "state:write:self");
    checkExpectedAccount(request, principal);
    checkCsrf(request, principal);

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректное тело запроса");
    }
    if (!hasExactKeys(body, ["action", "expectedVersion", "timeZone"])) {
      throw new AuthError(400, "INVALID_REQUEST", "Недопустимые поля в запросе");
    }

    const { action: clientAction, expectedVersion, timeZone } = body as {
      action: unknown;
      expectedVersion: unknown;
      timeZone: unknown;
    };

    if (
      typeof expectedVersion !== "number" ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0
    ) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректный expectedVersion");
    }

    const validatedTz = validateTimeZone(timeZone);
    const domainAction = validateAndBuildDomainAction(clientAction, validatedTz, nowMs());

    let snapshot: StateSnapshot | null = null;

    const actionTx = db.transaction(() => {
      // Re-verify session in transaction
      const freshPrincipal = getPrincipalFromRequest(request, db, cookieName, nowMs());
      if (!freshPrincipal || freshPrincipal.user.id !== principal.user.id) {
        throw new AuthError(409, "ACCOUNT_CHANGED", "Сессия завершена или изменилась");
      }

      const current = getStateSnapshot(db, principal.user.id);
      if (current.version !== expectedVersion) {
        throw new AuthError(409, "STATE_CONFLICT", "Конфликт версии состояния");
      }

      const nextState = reduceDemo(current.state, domainAction);
      snapshot = saveStateSnapshot(db, principal.user.id, expectedVersion, nextState);
    });

    actionTx();

    return reply.code(200).send(snapshot!);
  });

  // POST /api/me/reset
  fastify.post("/reset", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new AuthError(415, "UNSUPPORTED_MEDIA_TYPE", "Требуется application/json");
    }

    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());
    requirePermission(principal, "state:reset:self");
    checkExpectedAccount(request, principal);
    checkCsrf(request, principal);

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректное тело запроса");
    }
    if (!hasExactKeys(body, ["expectedVersion"])) {
      throw new AuthError(400, "INVALID_REQUEST", "Недопустимые поля в запросе");
    }

    const { expectedVersion } = body as { expectedVersion: unknown };
    if (
      typeof expectedVersion !== "number" ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0
    ) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректный expectedVersion");
    }

    let snapshot: StateSnapshot | null = null;

    const resetTx = db.transaction(() => {
      const freshPrincipal = getPrincipalFromRequest(request, db, cookieName, nowMs());
      if (!freshPrincipal || freshPrincipal.user.id !== principal.user.id) {
        throw new AuthError(409, "ACCOUNT_CHANGED", "Сессия завершена или изменилась");
      }

      snapshot = resetStateSnapshot(db, principal.user.id, expectedVersion);
    });

    resetTx();

    return reply.code(200).send(snapshot!);
  });
};
