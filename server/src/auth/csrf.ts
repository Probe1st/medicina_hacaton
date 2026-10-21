import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import type { FastifyRequest } from "fastify";
import { AuthError } from "./policy";

export function verifyCsrfToken(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") {
    return false;
  }
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function validateOriginAndHeaders(req: FastifyRequest, publicOrigin: string): void {
  // Check Sec-Fetch-Site
  const secFetchSite = req.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site") {
    throw new AuthError(403, "CSRF_REJECTED", "Cross-site requests are not permitted");
  }

  // Check custom header
  const customHeader = req.headers["x-marshrut-request"];
  if (customHeader !== "1") {
    throw new AuthError(403, "CSRF_REJECTED", "Missing required custom header X-Marshrut-Request");
  }

  // Check Origin
  const origin = req.headers.origin;
  if (!origin || origin !== publicOrigin) {
    throw new AuthError(403, "CSRF_REJECTED", "Invalid or missing Origin header");
  }
}
