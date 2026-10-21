import fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db";
import { parsePublicOrigin, type AppConfig } from "./config";
import { AuthRateLimiters } from "./auth/limits";
import { authRoutes } from "./auth/routes";
import { AuthError } from "./auth/policy";
import { stateRoutes } from "./state/routes";
import { issueRoutes } from "./issue";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BuildServerOptions {
  databasePath: string;
  publicOrigin: string;
  nodeEnv: "development" | "test" | "production";
  staticRoot?: string;
  nowMs?: () => number;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { databasePath, nodeEnv, nowMs = Date.now } = options;
  const publicOrigin = parsePublicOrigin(options.publicOrigin, nodeEnv);
  const staticRoot = options.staticRoot || resolve(__dirname, "../../web/dist");

  const config: AppConfig = {
    nodeEnv,
    port: 4173,
    databasePath,
    publicOrigin,
    staticRoot,
    trustProxy: nodeEnv === "production" ? "127.0.0.1" : false,
  };

  const app = fastify({
    bodyLimit: 4096,
    trustProxy: config.trustProxy,
    logger: {
      level: nodeEnv === "test" ? "silent" : "info",
      redact: [
        "req.headers.cookie",
        "res.headers['set-cookie']",
        "req.headers['x-csrf-token']",
        "req.headers['x-marshrut-account']",
        "body.password",
        "body.currentPassword",
        "body.newPassword",
        "body.state",
        "state_json",
      ],
    },
  });

  const db = openDatabase(databasePath);
  const rateLimiters = new AuthRateLimiters();

  await app.register(fastifyCookie);

  // Security headers on non-API responses
  app.addHook("onSend", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      reply.header("X-Frame-Options", "DENY");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("X-Content-Type-Options", "nosniff");
      if (nodeEnv !== "development") {
        reply.header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        );
      }
    }
  });

  // Serve static files if directory exists
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      wildcard: false,
    });
  }

  // Close DB on app close
  app.addHook("onClose", async () => {
    db.close();
  });

  // Global error handler
  app.setErrorHandler((error: unknown, _request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Vary", "Cookie, Origin");
    reply.header("X-Content-Type-Options", "nosniff");

    if (error instanceof AuthError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    const err = error as { statusCode?: number; code?: string; message?: string };
    const statusCode = err.statusCode || 500;
    if (statusCode === 413 || err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({
        error: {
          code: "REQUEST_TOO_LARGE",
          message: "Размер запроса превышает допустимый лимит",
        },
      });
    }

    if (statusCode === 415 || err.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return reply.code(415).send({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Неподдерживаемый тип содержимого",
        },
      });
    }

    if (statusCode === 400 || err.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: err.message || "Некорректный запрос",
        },
      });
    }

    // Default internal error
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Внутренняя ошибка сервера",
      },
    });
  });

  // Health check
  app.get("/api/health", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return reply.code(200).send({ ok: true });
  });

  // Register Auth routes
  await app.register(authRoutes, {
    prefix: "/api/auth",
    config,
    db,
    rateLimiters,
    nowMs,
  });

  // Register State routes
  await app.register(stateRoutes, {
    prefix: "/api/me",
    config,
    db,
    nowMs,
  });

  // Register Issue routes
  await app.register(issueRoutes, {
    prefix: "/api/issue",
    config,
    db,
    nowMs,
  });

  // Specific 404 handler for unmatched /api/**, fallback to index.html for SPA
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Ресурс не найден",
        },
      });
    }

    if (existsSync(staticRoot)) {
      return reply.sendFile("index.html");
    }

    return reply.code(404).send("Not Found");
  });

  return app;
}
