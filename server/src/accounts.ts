import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { openDatabase } from "./db";
import { INITIAL_STATE } from "../../web/src/domain/reducer";

export type UserRole = "patient" | "staff";

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
}

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function validateUsername(username: unknown): string {
  if (typeof username !== "string") {
    throw new Error("Username must be a string");
  }
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized)) {
    throw new Error(
      `Invalid username "${username}". Must match ^[a-z0-9][a-z0-9_-]{2,31}$`
    );
  }
  return normalized;
}

export function validateRole(role: unknown): UserRole {
  if (role !== "patient" && role !== "staff") {
    throw new Error(`Invalid role "${role}". Must be "patient" or "staff"`);
  }
  return role;
}
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
export async function createAccount(input: {
  databasePath: string;
  username: string;
  role: UserRole;
  password?: string;
}): Promise<{ user: PublicUser; password: string }> {
  const normalizedUsername = validateUsername(input.username);
  const role = validateRole(input.role);

  const password = input.password || randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const id = randomUUID();
  const createdAt = Date.now();

  const db = openDatabase(input.databasePath);
  try {
    const createUserTx = db.transaction(() => {
      const existing = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(normalizedUsername);

      if (existing) {
        throw new Error(`User "${normalizedUsername}" already exists`);
      }

      db.prepare(
        "INSERT INTO users (id, username, role, password_hash, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)"
      ).run(id, normalizedUsername, role, passwordHash, createdAt);

      db.prepare(
        "INSERT INTO user_states (user_id, state_json, version) VALUES (?, ?, 0)"
      ).run(id, JSON.stringify(INITIAL_STATE));
    });

    createUserTx();

    return {
      user: {
        id,
        username: normalizedUsername,
        role,
      },
      password,
    };
  } finally {
    db.close();
  }
}

export async function resetPassword(input: {
  databasePath: string;
  username: string;
  password?: string;
}): Promise<{ user: PublicUser; password: string }> {
  const normalizedUsername = validateUsername(input.username);
  const password = input.password || randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  const db = openDatabase(input.databasePath);
  try {
    let resultUser: PublicUser | null = null;

    const resetTx = db.transaction(() => {
      const user = db
        .prepare("SELECT id, username, role FROM users WHERE username = ?")
        .get(normalizedUsername) as { id: string; username: string; role: UserRole } | undefined;

      if (!user) {
        throw new Error(`User "${normalizedUsername}" not found`);
      }

      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        passwordHash,
        user.id
      );

      // Revoke all sessions for this user atomically
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

      resultUser = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    });

    resetTx();

    return {
      user: resultUser!,
      password,
    };
  } finally {
    db.close();
  }
}

export async function setRole(input: {
  databasePath: string;
  username: string;
  role: UserRole;
}): Promise<PublicUser> {
  const normalizedUsername = validateUsername(input.username);
  const role = validateRole(input.role);

  const db = openDatabase(input.databasePath);
  try {
    let resultUser: PublicUser | null = null;

    const roleTx = db.transaction(() => {
      const user = db
        .prepare("SELECT id, username FROM users WHERE username = ?")
        .get(normalizedUsername) as { id: string; username: string } | undefined;

      if (!user) {
        throw new Error(`User "${normalizedUsername}" not found`);
      }

      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

      resultUser = {
        id: user.id,
        username: user.username,
        role,
      };
    });

    roleTx();

    return resultUser!;
  } finally {
    db.close();
  }
}

export async function disableAccount(input: {
  databasePath: string;
  username: string;
}): Promise<PublicUser> {
  const normalizedUsername = validateUsername(input.username);

  const db = openDatabase(input.databasePath);
  try {
    let resultUser: PublicUser | null = null;

    const disableTx = db.transaction(() => {
      const user = db
        .prepare("SELECT id, username, role FROM users WHERE username = ?")
        .get(normalizedUsername) as { id: string; username: string; role: UserRole } | undefined;

      if (!user) {
        throw new Error(`User "${normalizedUsername}" not found`);
      }

      db.prepare("UPDATE users SET enabled = 0 WHERE id = ?").run(user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

      resultUser = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    });

    disableTx();

    return resultUser!;
  } finally {
    db.close();
  }
}

export async function enableAccount(input: {
  databasePath: string;
  username: string;
}): Promise<PublicUser> {
  const normalizedUsername = validateUsername(input.username);

  const db = openDatabase(input.databasePath);
  try {
    let resultUser: PublicUser | null = null;

    const enableTx = db.transaction(() => {
      const user = db
        .prepare("SELECT id, username, role FROM users WHERE username = ?")
        .get(normalizedUsername) as { id: string; username: string; role: UserRole } | undefined;

      if (!user) {
        throw new Error(`User "${normalizedUsername}" not found`);
      }

      db.prepare("UPDATE users SET enabled = 1 WHERE id = ?").run(user.id);

      resultUser = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    });

    enableTx();

    return resultUser!;
  } finally {
    db.close();
  }
}

export interface SeedUserConfig {
  username: string;
  role: UserRole;
  password: string;
  description: string;
}

export function parseSeedUsersFromEnv(env?: NodeJS.ProcessEnv): SeedUserConfig[] {
  const targetEnv = env ?? process.env;
  const patientUsername = validateUsername(targetEnv.DEMO_PATIENT_USERNAME?.trim() || "patient_demo");
  const patientPassword = targetEnv.DEMO_PATIENT_PASSWORD || "patient123";
  const staffUsername = validateUsername(targetEnv.DEMO_STAFF_USERNAME?.trim() || "staff_demo");
  const staffPassword = targetEnv.DEMO_STAFF_PASSWORD || "staff123";

  const users: SeedUserConfig[] = [
    {
      username: patientUsername,
      role: "patient",
      password: patientPassword,
      description: "Учебный пациент (просмотр и отметка задач, барьеры, напоминания)",
    },
    {
      username: staffUsername,
      role: "staff",
      password: staffPassword,
      description: "Сотрудник стенда (все права пациента + генерация QR и выдача памяток)",
    },
  ];

  const demoAccountsRaw = targetEnv.DEMO_ACCOUNTS?.trim();
  if (demoAccountsRaw) {
    if (demoAccountsRaw.startsWith("[") || demoAccountsRaw.startsWith("{")) {
      let items: unknown[] = [];
      try {
        const parsed = JSON.parse(demoAccountsRaw);
        items = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err) {
        console.warn("Failed to parse DEMO_ACCOUNTS as JSON:", err);
      }

      for (const item of items) {
        if (!item || typeof item !== "object") {
          console.warn("Skipping invalid DEMO_ACCOUNTS JSON entry (not an object):", item);
          continue;
        }
        const record = item as Record<string, unknown>;
        if (record.username === undefined || record.password === undefined || record.role === undefined) {
          console.warn("Skipping invalid DEMO_ACCOUNTS JSON entry (missing required fields):", item);
          continue;
        }
        const username = validateUsername(record.username);
        const role = validateRole(typeof record.role === "string" ? record.role.trim() : record.role);
        users.push({
          username,
          role,
          password: String(record.password),
          description:
            typeof record.description === "string" && record.description.trim()
              ? record.description.trim()
              : `Демо-аккаунт (${role})`,
        });
      }
    } else {
      const entries = demoAccountsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      for (const entry of entries) {
        const parts = entry.split(":");
        if (parts.length < 3) {
          console.warn(
            `Malformed entry in DEMO_ACCOUNTS: "${entry}". Expected format: username:password:role[:description]`
          );
          continue;
        }
        const [rawUser, rawPass, rawRole, ...rest] = parts;
        if (!rawUser || !rawPass || !rawRole) {
          console.warn(`Malformed entry in DEMO_ACCOUNTS: "${entry}". Missing user, password, or role.`);
          continue;
        }
        const username = validateUsername(rawUser);
        const role = validateRole(rawRole.trim());
        const desc = rest.join(":").trim();
        users.push({
          username,
          role,
          password: rawPass,
          description: desc || `Демо-аккаунт (${role})`,
        });
      }
    }
  }

  return users;
}

export async function seedAccounts(
  databasePath: string,
  users?: SeedUserConfig[]
): Promise<{ user: string; role: string; action: "создан" | "обновлён" }[]> {
  const seedUsers = users ?? parseSeedUsersFromEnv();
  const db = openDatabase(databasePath);
  const results: { user: string; role: string; action: "создан" | "обновлён" }[] = [];

  try {
    for (const item of seedUsers) {
      const normalizedUsername = validateUsername(item.username);
      const role = validateRole(item.role);

      const existing = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(normalizedUsername);

      if (existing) {
        await resetPassword({
          databasePath,
          username: normalizedUsername,
          password: item.password,
        });
        results.push({
          user: normalizedUsername,
          role,
          action: "обновлён",
        });
      } else {
        await createAccount({
          databasePath,
          username: normalizedUsername,
          role,
          password: item.password,
        });
        results.push({
          user: normalizedUsername,
          role,
          action: "создан",
        });
      }
    }
  } finally {
    db.close();
  }

  return results;
}
