import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/app";
import { createAccount } from "../src/accounts";
import { openDatabase } from "../src/db";

describe("State commands, optimistic locking, and conflict handling", () => {
  it("enforces version checks and rejects stale versions with 409 STATE_CONFLICT", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-state-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user, password } = await createAccount({
        databasePath: dbPath,
        username: "patient_state",
        role: "patient",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "patient_state", password },
      });
      const cookie = (login.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];
      const csrf = login.json().csrfToken;

      // 1. First mutation with expectedVersion: 0 succeeds
      const req1 = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo" },
          expectedVersion: 0,
          timeZone: "Europe/Moscow",
        },
      });
      expect(req1.statusCode).toBe(200);
      expect(req1.json().version).toBe(1);

      // 2. Second concurrent/stale mutation with expectedVersion: 0 fails with 409
      const req2 = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "SET_TEXT_MODE", mode: "original" },
          expectedVersion: 0,
          timeZone: "Europe/Moscow",
        },
      });
      expect(req2.statusCode).toBe(409);
      expect(req2.json().error.code).toBe("STATE_CONFLICT");

      // 3. Identity / no-op action does not increment version
      const noOpReq = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo" },
          expectedVersion: 1,
          timeZone: "Europe/Moscow",
        },
      });
      expect(noOpReq.statusCode).toBe(200);
      expect(noOpReq.json().version).toBe(1);

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("validates actions, timestamps, and templates strictly", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-state-test2-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user, password } = await createAccount({
        databasePath: dbPath,
        username: "patient_val",
        role: "patient",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "patient_val", password },
      });
      const cookie = (login.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];
      const csrf = login.json().csrfToken;

      // Client attempting to supply 'now' -> 400 INVALID_REQUEST
      const clientNowRes = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo", now: "2026-01-01T00:00:00.000Z" },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(clientNowRes.statusCode).toBe(400);

      // Unknown template -> 422 ACTION_NOT_ALLOWED
      const badTemplateRes = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "unknown-plan" },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(badTemplateRes.statusCode).toBe(422);

      // Unknown task in valid template -> 422 ACTION_NOT_ALLOWED
      const badTaskRes = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "COMPLETE_TASK", planId: "orvi-demo", taskId: "fake_task" },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(badTaskRes.statusCode).toBe(422);

      // SET_REMINDER with past timestamp -> 422 ACTION_NOT_ALLOWED
      const pastReminderRes = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: {
            type: "SET_REMINDER",
            planId: "orvi-demo",
            taskId: "contact",
            at: "2020-01-01T10:00:00.000Z",
          },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(pastReminderRes.statusCode).toBe(422);

      // Invalid timeZone -> 400 INVALID_REQUEST
      const badTzRes = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": user.id,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookie}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo" },
          expectedVersion: 0,
          timeZone: "Mars/Olympus",
        },
      });
      expect(badTzRes.statusCode).toBe(400);

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles corrupted state_json with 500 STATE_UNAVAILABLE and does not silently reset", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-state-test3-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user, password } = await createAccount({
        databasePath: dbPath,
        username: "patient_corrupt",
        role: "patient",
      });

      // Corrupt state_json directly in SQLite
      const db = openDatabase(dbPath);
      db.prepare("UPDATE user_states SET state_json = ? WHERE user_id = ?").run(
        '{"invalid":"corrupted json}',
        user.id
      );
      db.close();

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "patient_corrupt", password },
      });
      const cookie = (login.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];

      const res = await app.inject({
        method: "GET",
        url: "/api/me/state",
        headers: {
          "x-marshrut-account": user.id,
          cookie: `marshrut-session=${cookie}`,
        },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe("STATE_UNAVAILABLE");

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
