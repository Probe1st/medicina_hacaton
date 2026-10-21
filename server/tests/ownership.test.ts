import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/app";
import { createAccount } from "../src/accounts";

describe("Resource authorization and ownership boundaries", () => {
  it("strictly isolates state between users and enforces staff-only issue", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-own-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      // Create Patient A, Patient B, and Staff C
      const { user: userA, password: pwdA } = await createAccount({
        databasePath: dbPath,
        username: "patient_a",
        role: "patient",
      });
      const { user: userB, password: pwdB } = await createAccount({
        databasePath: dbPath,
        username: "patient_b",
        role: "patient",
      });
      const { user: userC, password: pwdC } = await createAccount({
        databasePath: dbPath,
        username: "staff_c",
        role: "staff",
      });

      const app = await buildServer({
        databasePath: dbPath,
        publicOrigin: "http://127.0.0.1:4173",
        nodeEnv: "test",
      });

      // Login A
      const loginA = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "patient_a", password: pwdA },
      });
      const cookieA = (loginA.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];
      const csrfA = loginA.json().csrfToken;

      // Login B
      const loginB = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "patient_b", password: pwdB },
      });
      const cookieB = (loginB.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];
      const csrfB = loginB.json().csrfToken;

      // Login C (staff)
      const loginC = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "content-type": "application/json",
        },
        payload: { username: "staff_c", password: pwdC },
      });
      const cookieC = (loginC.headers["set-cookie"] as string).match(/marshrut-session=([^;]+)/)![1];
      const csrfC = loginC.json().csrfToken;

      // A opens plan and completes a task
      const openPlanA = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfA,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieA}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo" },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(openPlanA.statusCode).toBe(200);
      expect(openPlanA.json().version).toBe(1);

      const completeTaskA = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfA,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieA}`,
        },
        payload: {
          action: { type: "COMPLETE_TASK", planId: "orvi-demo", taskId: "read" },
          expectedVersion: 1,
          timeZone: "UTC",
        },
      });
      expect(completeTaskA.statusCode).toBe(200);
      expect(completeTaskA.json().version).toBe(2);
      expect(completeTaskA.json().state.plans["orvi-demo"].tasks.read.status).toBe("done");

      // Verify B's state remains empty / untouched
      const stateB = await app.inject({
        method: "GET",
        url: "/api/me/state",
        headers: {
          "x-marshrut-account": userB.id,
          cookie: `marshrut-session=${cookieB}`,
        },
      });
      expect(stateB.statusCode).toBe(200);
      expect(stateB.json().version).toBe(0);
      expect(stateB.json().state.plans).toEqual({});

      // Patient A attempts template:issue -> 403 FORBIDDEN
      const patientIssue = await app.inject({
        method: "POST",
        url: "/api/issue",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfA,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieA}`,
        },
        payload: {
          templateId: "orvi-demo",
        },
      });
      expect(patientIssue.statusCode).toBe(403);
      expect(patientIssue.json().error.code).toBe("FORBIDDEN");

      // Patient A attempts to supply role: "staff" in payload -> rejected 403
      const sneakyIssue = await app.inject({
        method: "POST",
        url: "/api/issue",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfA,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieA}`,
        },
        payload: {
          templateId: "orvi-demo",
          role: "staff",
        },
      });
      expect(sneakyIssue.statusCode).toBe(403);
      expect(sneakyIssue.json().error.code).toBe("FORBIDDEN");

      // Staff C attempts extra fields -> rejected 400 INVALID_REQUEST
      const extraFieldIssue = await app.inject({
        method: "POST",
        url: "/api/issue",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userC.id,
          "x-csrf-token": csrfC,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieC}`,
        },
        payload: {
          templateId: "orvi-demo",
          extraField: "not allowed",
        },
      });
      expect(extraFieldIssue.statusCode).toBe(400);
      expect(extraFieldIssue.json().error.code).toBe("INVALID_REQUEST");

      // Staff C issues template -> 200 with generic hash
      const staffIssue = await app.inject({
        method: "POST",
        url: "/api/issue",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userC.id,
          "x-csrf-token": csrfC,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieC}`,
        },
        payload: {
          templateId: "orvi-demo",
        },
      });
      expect(staffIssue.statusCode).toBe(200);
      expect(staffIssue.json()).toEqual({
        templateId: "orvi-demo",
        hash: "#/plan/orvi-demo",
      });

      // Mismatched expected account (request with cookie B but X-Marshrut-Account A.id)
      const hijackedReq = await app.inject({
        method: "POST",
        url: "/api/me/actions",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfB,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieB}`,
        },
        payload: {
          action: { type: "OPEN_PLAN", planId: "orvi-demo" },
          expectedVersion: 0,
          timeZone: "UTC",
        },
      });
      expect(hijackedReq.statusCode).toBe(409);
      expect(hijackedReq.json().error.code).toBe("ACCOUNT_CHANGED");

      // Verify B's state was not touched
      const checkB = await app.inject({
        method: "GET",
        url: "/api/me/state",
        headers: {
          "x-marshrut-account": userB.id,
          cookie: `marshrut-session=${cookieB}`,
        },
      });
      expect(checkB.json().version).toBe(0);

      // Reset isolation: A resets their state
      const resetA = await app.inject({
        method: "POST",
        url: "/api/me/reset",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-marshrut-request": "1",
          "x-marshrut-account": userA.id,
          "x-csrf-token": csrfA,
          "content-type": "application/json",
          cookie: `marshrut-session=${cookieA}`,
        },
        payload: {
          expectedVersion: 2,
        },
      });
      expect(resetA.statusCode).toBe(200);
      expect(resetA.json().version).toBe(3);
      expect(resetA.json().state.plans).toEqual({});

      await app.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
