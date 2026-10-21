import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCsrfToken } from "../src/auth/csrf";
import { buildServer } from "../src/app";

describe("CSRF and request integrity protections", () => {
  it("verifies CSRF synchronizer tokens safely", () => {
    const token = "a".repeat(64);
    expect(verifyCsrfToken(token, token)).toBe(true);
    expect(verifyCsrfToken(token, "b".repeat(64))).toBe(false);
    expect(verifyCsrfToken(token, "short")).toBe(false);
    expect(verifyCsrfToken(token, undefined)).toBe(false);
  });

  it("rejects login requests with missing or invalid Origin / custom headers", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-csrf-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      // 1. Missing Origin
      const resNoOrigin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "any", password: "any" },
      });
      expect(resNoOrigin.statusCode).toBe(403);
      expect(resNoOrigin.json().error.code).toBe("CSRF_REJECTED");

      // 2. Mismatched Origin
      const resBadOrigin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://attacker.com",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "any", password: "any" },
      });
      expect(resBadOrigin.statusCode).toBe(403);
      expect(resBadOrigin.json().error.code).toBe("CSRF_REJECTED");

      // 3. Missing X-Marshrut-Request header
      const resNoCustomHeader = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "content-type": "application/json",
        },
        payload: { username: "any", password: "any" },
      });
      expect(resNoCustomHeader.statusCode).toBe(403);
      expect(resNoCustomHeader.json().error.code).toBe("CSRF_REJECTED");

      // 4. Sec-Fetch-Site: cross-site
      const resCrossSite = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "sec-fetch-site": "cross-site",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "any", password: "any" },
      });
      expect(resCrossSite.statusCode).toBe(403);
      expect(resCrossSite.json().error.code).toBe("CSRF_REJECTED");

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
