import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function openDatabase(databasePath: string): Database.Database {
  // Ensure strict permissions for SQLite file creation
  try {
    process.umask(0o077);
  } catch {
    // Ignore if not supported in environment
  }

  const db = new Database(databasePath);

  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  migrateDatabase(db);

  return db;
}

export function migrateDatabase(db: Database.Database): void {
  const userVersionRow = db.pragma("user_version", { simple: true }) as number;

  if (userVersionRow === 0) {
    const migrationPath = join(__dirname, "../migrations/001-auth.sql");
    const migrationSql = readFileSync(migrationPath, "utf8");

    const applyMigration = db.transaction(() => {
      db.exec(migrationSql);
      db.pragma("user_version = 1");
    });

    applyMigration();
  } else if (userVersionRow === 1) {
    // Schema is current
  } else {
    throw new Error(`Unsupported database schema user_version: ${userVersionRow}`);
  }
}
