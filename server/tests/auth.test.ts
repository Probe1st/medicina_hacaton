import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/app";
import { createAccount } from "../src/accounts";
import { openDatabase } from "../src/db";

describe("Server authentication and session management", () => {
  it("manages session lifecycle: bootstrap, login, inspection, expiration, and logout", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-auth-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    let currentClock = 1700000000000;
    const nowMs = () => currentClock;

    try {
      // 1. Create a patient account
      const { user: createdUser, password } = await createAccount({
        databasePath: dbPath,
        username: "patient_one",
        role: "patient",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
        nowMs,
      });

      // 2. Initial GET session without cookie
      const sessionEmpty = await app.inject({
        method: "GET",
        url: "/api/auth/session",
      });
      expect(sessionEmpty.statusCode).toBe(200);
      expect(sessionEmpty.json()).toEqual({ authenticated: false });
      expect(sessionEmpty.headers["set-cookie"]).toBeUndefined();

      // 3. Attempt login with wrong password
      const badLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_one",
          password: "wrong-password-1234",
        },
      });
      expect(badLogin.statusCode).toBe(401);
      expect(badLogin.json().error.code).toBe("INVALID_CREDENTIALS");
      expect(badLogin.headers["set-cookie"]).toBeUndefined();

      // 4. Attempt login with unknown user (dummy verification)
      const unknownLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "nonexistent_user",
          password: "any-password",
        },
      });
      expect(unknownLogin.statusCode).toBe(401);
      expect(unknownLogin.json().error.code).toBe("INVALID_CREDENTIALS");

      // 5. Successful login
      const goodLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_one",
          password,
        },
      });
      expect(goodLogin.statusCode).toBe(200);
      const loginBody = goodLogin.json();
      expect(loginBody.authenticated).toBe(true);
      expect(loginBody.user.id).toBe(createdUser.id);
      expect(loginBody.user.username).toBe("patient_one");
      expect(loginBody.user.role).toBe("patient");
      expect(loginBody.csrfToken).toBeDefined();

      const setCookie = goodLogin.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie!;
      expect(cookieStr).toContain("marshrut-session=");
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("SameSite=Lax");

      // Extract cookie value
      const match = cookieStr.match(/marshrut-session=([^;]+)/);
      const sessionToken = match![1];

      // Check token in DB is hashed, raw token never stored in DB
      const db = openDatabase(dbPath);
      const sessionInDb = db.prepare("SELECT * FROM sessions WHERE user_id = ?").get(createdUser.id) as {
        token_hash: string;
      };
      expect(sessionInDb.token_hash).not.toBe(sessionToken);
      db.close();

      // 6. Inspect active session
      const inspectRes = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `marshrut-session=${sessionToken}`,
        },
      });
      expect(inspectRes.statusCode).toBe(200);
      expect(inspectRes.json().authenticated).toBe(true);
      expect(inspectRes.json().user.username).toBe("patient_one");

      // 7. Check ALREADY_AUTHENTICATED on second login with existing active cookie
      const reLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
          cookie: `marshrut-session=${sessionToken}`,
        },
        payload: {
          username: "patient_one",
          password,
        },
      });
      expect(reLoginRes.statusCode).toBe(409);
      expect(reLoginRes.json().error.code).toBe("ALREADY_AUTHENTICATED");

      // 8. Test expiration: exactly at 8 hours (now + 8*3600*1000)
      currentClock += 8 * 60 * 60 * 1000;
      const expiredRes = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `marshrut-session=${sessionToken}`,
        },
      });
      expect(expiredRes.statusCode).toBe(200);
      expect(expiredRes.json().authenticated).toBe(false);
      expect(expiredRes.headers["set-cookie"]).toBeUndefined();

      // 9. Reset clock and log in again for logout test
      currentClock = 1700000000000 + 1000;
      const login2 = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_one",
          password,
        },
      });
      const session2Cookie = login2.headers["set-cookie"]!;
      const session2Token = (Array.isArray(session2Cookie) ? session2Cookie[0] : session2Cookie).match(/marshrut-session=([^;]+)/)![1];
      const csrf2 = login2.json().csrfToken;

      // 10. Logout without CSRF token should be rejected with 403
      const badLogout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": createdUser.id,
          cookie: `marshrut-session=${session2Token}`,
        },
      });
      expect(badLogout.statusCode).toBe(403);
      expect(badLogout.json().error.code).toBe("CSRF_REJECTED");

      // 11. Proper logout
      const goodLogout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": createdUser.id,
          "x-csrf-token": csrf2,
          cookie: `marshrut-session=${session2Token}`,
        },
      });
      expect(goodLogout.statusCode).toBe(204);

      // Verify session was removed from DB
      const afterLogout = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `marshrut-session=${session2Token}`,
        },
      });
      expect(afterLogout.statusCode).toBe(200);
      expect(afterLogout.json().authenticated).toBe(false);

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles password change and session revocation", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-pwd-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user, password: initialPassword } = await createAccount({
        databasePath: dbPath,
        username: "patient_pwd",
        role: "patient",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      // Login
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_pwd",
          password: initialPassword,
        },
      });
      const cookieHeader = loginRes.headers["set-cookie"]!;
      const token = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).match(/marshrut-session=([^;]+)/)![1];
      const csrf = loginRes.json().csrfToken;

      // Bad current password -> 400 CURRENT_PASSWORD_INVALID
      const badPwdRes = await app.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${token}`,
        },
        payload: {
          currentPassword: "wrongCurrentPassword123",
          newPassword: "validNewPassword12345",
        },
      });
      expect(badPwdRes.statusCode).toBe(400);
      expect(badPwdRes.json().error.code).toBe("CURRENT_PASSWORD_INVALID");

      // Too short new password (<15 chars) -> 400 INVALID_REQUEST
      const shortPwdRes = await app.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${token}`,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: "short-pwd",
        },
      });
      expect(shortPwdRes.statusCode).toBe(400);
      expect(shortPwdRes.json().error.code).toBe("INVALID_REQUEST");

      // Successful password change
      const newPassword = "brandNewSecurePassword2026!";
      const changeRes = await app.inject({
        method: "POST",
        url: "/api/auth/password",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${token}`,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword,
        },
      });
      expect(changeRes.statusCode).toBe(204);

      // Old session is revoked
      const sessionAfterChange = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `marshrut-session=${token}`,
        },
      });
      expect(sessionAfterChange.json().authenticated).toBe(false);

      // Login with old password fails
      const oldLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_pwd",
          password: initialPassword,
        },
      });
      expect(oldLogin.statusCode).toBe(401);

      // Login with new password succeeds
      const newLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "patient_pwd",
          password: newPassword,
        },
      });
      expect(newLogin.statusCode).toBe(200);

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("enforces rate limits on repeated failed login attempts", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-rl-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      // 5 attempts on the same username
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: {
            origin: "http://127.0.0.1:4173",
            "x-marshrut-request": "1",
            "content-type": "application/json",
          },
          payload: {
            username: "target_user",
            password: "bad-password",
          },
        });
        expect(res.statusCode).toBe(401);
      }

      // 6th attempt should be blocked by rate limiter
      const blockedRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "target_user",
          password: "bad-password",
        },
      });
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.json().error.code).toBe("TOO_MANY_ATTEMPTS");
      expect(blockedRes.headers["retry-after"]).toBeDefined();

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("enforces 4096 byte body limit with 413 REQUEST_TOO_LARGE", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-limit-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      const oversizedPayload = {
        username: "test_user",
        password: "x".repeat(5000),
      };

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: oversizedPayload,
      });

      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe("REQUEST_TOO_LARGE");

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses __Host- prefix and Secure in production mode", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-prod-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { password } = await createAccount({
        databasePath: dbPath,
        username: "prod_user",
        role: "patient",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "https://marshrut.example.org",
        nodeEnv: "production",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "https://marshrut.example.org",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: {
          username: "prod_user",
          password,
        },
      });

      expect(res.statusCode).toBe(200);
      const cookieHeader = res.headers["set-cookie"]!;
      const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      expect(cookieStr).toContain("__Host-marshrut-session=");
      expect(cookieStr).toContain("Secure");
      expect(cookieStr).not.toContain("Domain=");

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
