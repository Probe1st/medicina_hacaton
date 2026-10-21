import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import {
  createAccount,
  disableAccount,
  enableAccount,
  resetPassword,
  setRole,
  validateRole,
  validateUsername,
  verifyPassword,
} from "../src/accounts";
import { INITIAL_STATE } from "../../web/src/domain/reducer";

describe("Accounts management and operations", () => {
  it("validates username rules strictly", () => {
    expect(validateUsername("  alice_1  ")).toBe("alice_1");
    expect(validateUsername("Bob-2")).toBe("bob-2");

    // Too short (< 3 chars)
    expect(() => validateUsername("ab")).toThrow();
    // Too long (> 32 chars)
    expect(() => validateUsername("a".repeat(33))).toThrow();
    // Invalid characters
    expect(() => validateUsername("alice@domain")).toThrow();
    expect(() => validateUsername("user name")).toThrow();
    // Must start with alphanumeric
    expect(() => validateUsername("-alice")).toThrow();
    expect(() => validateUsername("_alice")).toThrow();
  });

  it("validates role strictly", () => {
    expect(validateRole("patient")).toBe("patient");
    expect(validateRole("staff")).toBe("staff");
    expect(() => validateRole("admin")).toThrow();
    expect(() => validateRole("guest")).toThrow();
  });

  it("creates account with valid argon2id hash and initial user state", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-acc-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user, password } = await createAccount({
        databasePath: dbPath,
        username: "patient_one",
        role: "patient",
      });

      expect(user.username).toBe("patient_one");
      expect(user.role).toBe("patient");
      expect(user.id).toBeDefined();
      expect(password.length).toBeGreaterThanOrEqual(24);

      const db = openDatabase(dbPath);
      const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as {
        id: string;
        username: string;
        role: string;
        password_hash: string;
        enabled: number;
      };
      expect(userRow).toBeDefined();
      expect(userRow.username).toBe("patient_one");
      expect(userRow.role).toBe("patient");
      expect(userRow.enabled).toBe(1);
      expect(userRow.password_hash.startsWith("$argon2id$")).toBe(true);

      // Verify password works with argon2
      const isMatch = await verifyPassword(userRow.password_hash, password);
      expect(isMatch).toBe(true);

      // Verify user_states was created with INITIAL_STATE and version 0
      const stateRow = db.prepare("SELECT * FROM user_states WHERE user_id = ?").get(user.id) as {
        user_id: string;
        state_json: string;
        version: number;
      };
      expect(stateRow).toBeDefined();
      expect(stateRow.version).toBe(0);
      expect(JSON.parse(stateRow.state_json)).toEqual(INITIAL_STATE);

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate username without overwriting", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-acc-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      await createAccount({
        databasePath: dbPath,
        username: "patient_one",
        role: "patient",
      });

      await expect(
        createAccount({
          databasePath: dbPath,
          username: "patient_one",
          role: "staff",
        })
      ).rejects.toThrow(/already exists/);

      // Check role was NOT overwritten
      const db = openDatabase(dbPath);
      const userRow = db.prepare("SELECT role FROM users WHERE username = 'patient_one'").get() as { role: string };
      expect(userRow.role).toBe("patient");
      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resets password, preserves state, and revokes all active sessions", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-acc-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user } = await createAccount({
        databasePath: dbPath,
        username: "patient_one",
        role: "patient",
      });

      // Insert active session
      const db = openDatabase(dbPath);
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run("tok1", user.id, "csrf1", Date.now(), Date.now() + 10000);
      db.close();

      const { password: newPassword } = await resetPassword({
        databasePath: dbPath,
        username: "patient_one",
      });

      const dbAfter = openDatabase(dbPath);
      // Sessions revoked
      const sessionCount = dbAfter.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = ?").get(user.id) as { c: number };
      expect(sessionCount.c).toBe(0);

      // State preserved
      const stateRow = dbAfter.prepare("SELECT * FROM user_states WHERE user_id = ?").get(user.id) as { state_json: string };
      expect(JSON.parse(stateRow.state_json)).toEqual(INITIAL_STATE);

      // New password verifies
      const userRow = dbAfter.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
      const isNewValid = await verifyPassword(userRow.password_hash, newPassword);
      expect(isNewValid).toBe(true);

      dbAfter.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("updates role and revokes sessions", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-acc-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user } = await createAccount({
        databasePath: dbPath,
        username: "issuer_one",
        role: "staff",
      });

      const db = openDatabase(dbPath);
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run("tok2", user.id, "csrf2", Date.now(), Date.now() + 10000);
      db.close();

      const updated = await setRole({
        databasePath: dbPath,
        username: "issuer_one",
        role: "patient",
      });
      expect(updated.role).toBe("patient");

      const dbAfter = openDatabase(dbPath);
      const sessionCount = dbAfter.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = ?").get(user.id) as { c: number };
      expect(sessionCount.c).toBe(0);
      dbAfter.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("disables and enables account, ensuring sessions revoked on disable and not restored on enable", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-acc-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const { user } = await createAccount({
        databasePath: dbPath,
        username: "test_disable",
        role: "patient",
      });

      const db = openDatabase(dbPath);
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run("tok3", user.id, "csrf3", Date.now(), Date.now() + 10000);
      db.close();

      await disableAccount({
        databasePath: dbPath,
        username: "test_disable",
      });

      let dbCheck = openDatabase(dbPath);
      let userRow = dbCheck.prepare("SELECT enabled FROM users WHERE id = ?").get(user.id) as { enabled: number };
      expect(userRow.enabled).toBe(0);
      let sessionCount = dbCheck.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = ?").get(user.id) as { c: number };
      expect(sessionCount.c).toBe(0);
      dbCheck.close();

      // Enable account
      await enableAccount({
        databasePath: dbPath,
        username: "test_disable",
      });

      dbCheck = openDatabase(dbPath);
      userRow = dbCheck.prepare("SELECT enabled FROM users WHERE id = ?").get(user.id) as { enabled: number };
      expect(userRow.enabled).toBe(1);
      sessionCount = dbCheck.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = ?").get(user.id) as { c: number };
      expect(sessionCount.c).toBe(0); // old session is still gone
      dbCheck.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
