import type { FastifyPluginAsync } from "fastify";
import type Database from "better-sqlite3";
import type { AppConfig } from "./config";
import { getCookieName } from "./auth/sessions";
import { AuthError, requirePermission } from "./auth/policy";
import { validateOriginAndHeaders, verifyCsrfToken } from "./auth/csrf";
import { getPrincipalFromRequest } from "./auth/routes";
import { TEMPLATES } from "../../web/src/data/templates";
import type { TemplateId } from "../../web/src/domain/types";
import type { IssueResponse } from "../../web/src/domain/authTypes";

export interface IssueRouteOptions {
  config: AppConfig;
  db: Database.Database;
  nowMs?: () => number;
}

function hasExactKeys(obj: object, allowed: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return allowed.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

export const issueRoutes: FastifyPluginAsync<IssueRouteOptions> = async (
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

  fastify.post("/", async (request, reply) => {
    validateOriginAndHeaders(request, config.publicOrigin);

    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new AuthError(415, "UNSUPPORTED_MEDIA_TYPE", "Требуется application/json");
    }

    const principal = getPrincipalFromRequest(request, db, cookieName, nowMs());
    requirePermission(principal, "template:issue");

    // Expected account header
    const expectedAccount = request.headers["x-marshrut-account"];
    if (!expectedAccount) {
      throw new AuthError(400, "INVALID_REQUEST", "Заголовок X-Marshrut-Account обязателен");
    }
    if (expectedAccount !== principal.user.id) {
      throw new AuthError(409, "ACCOUNT_CHANGED", "Текущий аккаунт не совпадает с активной сессией");
    }

    // CSRF check
    const csrfHeader = request.headers["x-csrf-token"];
    if (!verifyCsrfToken(principal.csrfToken, csrfHeader)) {
      throw new AuthError(403, "CSRF_REJECTED", "Недействительный CSRF-токен");
    }

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthError(400, "INVALID_REQUEST", "Некорректное тело запроса");
    }
    if (!hasExactKeys(body, ["templateId"])) {
      throw new AuthError(400, "INVALID_REQUEST", "Недопустимые поля в запросе");
    }
    const { templateId } = body as { templateId: unknown };
    if (typeof templateId !== "string" || !TEMPLATES[templateId as TemplateId]) {
      throw new AuthError(422, "ACTION_NOT_ALLOWED", `Неизвестный шаблон: ${templateId}`);
    }

    const response: IssueResponse = {
      templateId,
      hash: `#/plan/${templateId}`,
    };

    return reply.code(200).send(response);
  });
};
