import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "../src/db";

describe("Database initialization and migrations", () => {
  it("creates tables and sets user_version to 1", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-db-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const db = openDatabase(dbPath);
      const version = db.pragma("user_version", { simple: true });
      expect(version).toBe(1);

      // Verify tables exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("user_states");

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is idempotent when re-running migration on existing database", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-db-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const db = openDatabase(dbPath);
      // Run migrate again
      expect(() => migrateDatabase(db)).not.toThrow();
      const version = db.pragma("user_version", { simple: true });
      expect(version).toBe(1);
      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when database user_version is greater than 1", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-db-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const rawDb = new Database(dbPath);
      rawDb.pragma("user_version = 2");
      rawDb.close();

      expect(() => openDatabase(dbPath)).toThrow(/Unsupported database schema user_version: 2/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("enforces foreign key cascading deletes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "marshrut-db-test-"));
    const dbPath = join(tempDir, "test.sqlite");

    try {
      const db = openDatabase(dbPath);

      // Insert dummy user
      db.prepare(
        "INSERT INTO users (id, username, role, password_hash, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("u1", "testuser", "patient", "hash", 1, Date.now());

      // Insert user state
      db.prepare(
        "INSERT INTO user_states (user_id, state_json, version) VALUES (?, ?, ?)"
      ).run("u1", "{}", 0);

      // Insert session
      db.prepare(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run("tok1", "u1", "csrf1", Date.now(), Date.now() + 10000);

      // Verify inserted
      expect(db.prepare("SELECT COUNT(*) as c FROM user_states WHERE user_id = 'u1'").get()).toEqual({ c: 1 });
      expect(db.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = 'u1'").get()).toEqual({ c: 1 });

      // Delete user
      db.prepare("DELETE FROM users WHERE id = 'u1'").run();

      // Verify cascade
      expect(db.prepare("SELECT COUNT(*) as c FROM user_states WHERE user_id = 'u1'").get()).toEqual({ c: 0 });
      expect(db.prepare("SELECT COUNT(*) as c FROM sessions WHERE user_id = 'u1'").get()).toEqual({ c: 0 });

      db.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
