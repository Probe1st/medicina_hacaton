import { describe, expect, it, vi } from "vitest";
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
  parseSeedUsersFromEnv,
  seedAccounts,
  type SeedUserConfig,
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

describe("Demo accounts seeding from environment", () => {
  it("returns default users when env is empty", () => {
    const users = parseSeedUsersFromEnv({});
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({
      username: "patient_demo",
      role: "patient",
      password: "patient123",
      description: expect.any(String),
    });
    expect(users[1]).toEqual({
      username: "staff_demo",
      role: "staff",
      password: "staff123",
      description: expect.any(String),
    });

    // When called without arguments, defaults to process.env
    const envUsers = parseSeedUsersFromEnv();
    expect(Array.isArray(envUsers)).toBe(true);
    expect(envUsers.length).toBeGreaterThanOrEqual(2);
  });

  it("reads custom DEMO_PATIENT_* and DEMO_STAFF_*", () => {
    const users = parseSeedUsersFromEnv({
      DEMO_PATIENT_USERNAME: "custom_patient",
      DEMO_PATIENT_PASSWORD: "secret_patient_pass",
      DEMO_STAFF_USERNAME: "custom_staff",
      DEMO_STAFF_PASSWORD: "secret_staff_pass",
    });
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      username: "custom_patient",
      role: "patient",
      password: "secret_patient_pass",
    });
    expect(users[1]).toMatchObject({
      username: "custom_staff",
      role: "staff",
      password: "secret_staff_pass",
    });
  });

  it("parses DEMO_ACCOUNTS from JSON and comma-separated string", () => {
    // 1. JSON format
    const jsonUsers = parseSeedUsersFromEnv({
      DEMO_ACCOUNTS: JSON.stringify([
        {
          username: "extra_patient",
          password: "pwd_p",
          role: "patient",
          description: "Extra patient desc",
        },
        {
          username: "extra_staff",
          password: "pwd_s",
          role: "staff",
        },
      ]),
    });
    expect(jsonUsers).toHaveLength(4);
    expect(jsonUsers[2]).toEqual({
      username: "extra_patient",
      role: "patient",
      password: "pwd_p",
      description: "Extra patient desc",
    });
    expect(jsonUsers[3]).toMatchObject({
      username: "extra_staff",
      role: "staff",
      password: "pwd_s",
    });

    // 2. Comma-separated format
    const csvUsers = parseSeedUsersFromEnv({
      DEMO_ACCOUNTS: "csv_user1:p1:patient,csv_user2:p2:staff:Custom Staff Desc",
    });
    expect(csvUsers).toHaveLength(4);
    expect(csvUsers[2]).toMatchObject({
      username: "csv_user1",
      role: "patient",
      password: "p1",
    });
    expect(csvUsers[3]).toEqual({
      username: "csv_user2",
      role: "staff",
      password: "p2",
      description: "Custom Staff Desc",
    });

    // 3. Graceful warning handling for malformed entries
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const malformedJson = parseSeedUsersFromEnv({
        DEMO_ACCOUNTS: "{not-valid-json",
      });
      expect(malformedJson).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockClear();
      const malformedCsv = parseSeedUsersFromEnv({
        DEMO_ACCOUNTS: "incomplete_entry,valid_extra:pass:patient",
      });
      expect(malformedCsv).toHaveLength(3);
      expect(malformedCsv[2].username).toBe("valid_extra");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("validates usernames and throws on invalid username/role", () => {
    // Invalid username in DEMO_PATIENT_USERNAME
    expect(() =>
      parseSeedUsersFromEnv({ DEMO_PATIENT_USERNAME: "inv alid" })
    ).toThrow();

    // Invalid username in DEMO_STAFF_USERNAME
    expect(() =>
      parseSeedUsersFromEnv({ DEMO_STAFF_USERNAME: "ab" })
    ).toThrow();

    // Invalid username in DEMO_ACCOUNTS (CSV)
    expect(() =>
      parseSeedUsersFromEnv({ DEMO_ACCOUNTS: "bad name:pass:patient" })
    ).toThrow();

    // Invalid role in DEMO_ACCOUNTS (CSV)
    expect(() =>
      parseSeedUsersFromEnv({ DEMO_ACCOUNTS: "valid_name:pass:admin" })
    ).toThrow();

    // Invalid username in DEMO_ACCOUNTS (JSON)
    expect(() =>
      parseSeedUsersFromEnv({
        DEMO_ACCOUNTS: JSON.stringify([{ username: "x", password: "p", role: "patient" }]),
      })
    ).toThrow();

    // Invalid role in DEMO_ACCOUNTS (JSON)
    expect(() =>
      parseSeedUsersFromEnv({
        DEMO_ACCOUNTS: JSON.stringify([{ username: "valid_user", password: "p", role: "superuser" }]),
      })
    ).toThrow();
  });

  it("seeds accounts on temp SQLite database: creates when new and updates password when existing", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-seed-test-"));
    const dbPath = join(tempDir, "test-seed.sqlite");

    try {
      const seedUsers: SeedUserConfig[] = [
        {
          username: "test_seed_patient",
          role: "patient",
          password: "initial_pass_patient",
          description: "Test Patient",
        },
        {
          username: "test_seed_staff",
          role: "staff",
          password: "initial_pass_staff",
          description: "Test Staff",
        },
      ];

      // 1. Initial seed -> both created
      const createdResults = await seedAccounts(dbPath, seedUsers);
      expect(createdResults).toEqual([
        { user: "test_seed_patient", role: "patient", action: "создан" },
        { user: "test_seed_staff", role: "staff", action: "создан" },
      ]);

      const db1 = openDatabase(dbPath);
      const patientRow1 = db1
        .prepare("SELECT password_hash FROM users WHERE username = ?")
        .get("test_seed_patient") as { password_hash: string };
      expect(patientRow1).toBeDefined();
      expect(await verifyPassword(patientRow1.password_hash, "initial_pass_patient")).toBe(true);
      db1.close();

      // 2. Re-seed with new passwords -> both updated
      const updatedUsers: SeedUserConfig[] = [
        {
          username: "test_seed_patient",
          role: "patient",
          password: "new_pass_patient",
          description: "Test Patient",
        },
        {
          username: "test_seed_staff",
          role: "staff",
          password: "new_pass_staff",
          description: "Test Staff",
        },
      ];

      const updatedResults = await seedAccounts(dbPath, updatedUsers);
      expect(updatedResults).toEqual([
        { user: "test_seed_patient", role: "patient", action: "обновлён" },
        { user: "test_seed_staff", role: "staff", action: "обновлён" },
      ]);

      const db2 = openDatabase(dbPath);
      const patientRow2 = db2
        .prepare("SELECT password_hash FROM users WHERE username = ?")
        .get("test_seed_patient") as { password_hash: string };
      expect(await verifyPassword(patientRow2.password_hash, "new_pass_patient")).toBe(true);
      expect(await verifyPassword(patientRow2.password_hash, "initial_pass_patient")).toBe(false);
      db2.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
