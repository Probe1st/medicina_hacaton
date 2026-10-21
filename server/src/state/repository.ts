import type Database from "better-sqlite3";
import type { DemoState } from "../../../web/src/domain/types";
import { INITIAL_STATE } from "../../../web/src/domain/reducer";
import { decodeDemoState } from "../../../web/src/domain/stateCodec";
import type { StateSnapshot } from "../../../web/src/domain/authTypes";
import { AuthError } from "../auth/policy";

export function getStateSnapshot(db: Database.Database, userId: string): StateSnapshot {
  const row = db
    .prepare("SELECT state_json, version FROM user_states WHERE user_id = ?")
    .get(userId) as { state_json: string; version: number } | undefined;

  if (!row) {
    throw new AuthError(500, "STATE_UNAVAILABLE", "Состояние пользователя не найдено");
  }

  const decoded = decodeDemoState(row.state_json);
  if (decoded.kind !== "ok") {
    throw new AuthError(500, "STATE_UNAVAILABLE", `Повреждённое состояние: ${decoded.reason}`);
  }

  return {
    state: decoded.state,
    version: row.version,
  };
}

export function saveStateSnapshot(
  db: Database.Database,
  userId: string,
  expectedVersion: number,
  newState: DemoState
): StateSnapshot {
  const row = db
    .prepare("SELECT state_json, version FROM user_states WHERE user_id = ?")
    .get(userId) as { state_json: string; version: number } | undefined;

  if (!row) {
    throw new AuthError(500, "STATE_UNAVAILABLE", "Состояние пользователя не найдено");
  }

  if (row.version !== expectedVersion) {
    throw new AuthError(409, "STATE_CONFLICT", "Версия состояния не совпадает. Обновите состояние и повторите действие");
  }

  const serialized = JSON.stringify(newState);
  const validated = decodeDemoState(serialized);
  if (validated.kind !== "ok") {
    throw new AuthError(500, "STATE_UNAVAILABLE", `Невалидное результирующее состояние: ${validated.reason}`);
  }

  // Identity / no-op check: if JSON did not change, return unchanged snapshot
  if (serialized === row.state_json) {
    return {
      state: validated.state,
      version: row.version,
    };
  }

  const nextVersion = row.version + 1;
  const updateRes = db
    .prepare("UPDATE user_states SET state_json = ?, version = ? WHERE user_id = ? AND version = ?")
    .run(serialized, nextVersion, userId, expectedVersion);

  if (updateRes.changes === 0) {
    throw new AuthError(409, "STATE_CONFLICT", "Конфликт параллельной записи. Обновите состояние и повторите действие");
  }

  return {
    state: validated.state,
    version: nextVersion,
  };
}

export function resetStateSnapshot(
  db: Database.Database,
  userId: string,
  expectedVersion: number
): StateSnapshot {
  const row = db
    .prepare("SELECT version FROM user_states WHERE user_id = ?")
    .get(userId) as { version: number } | undefined;

  if (!row) {
    throw new AuthError(500, "STATE_UNAVAILABLE", "Состояние пользователя не найдено");
  }

  if (row.version !== expectedVersion) {
    throw new AuthError(409, "STATE_CONFLICT", "Версия состояния не совпадает. Обновите состояние");
  }

  const nextVersion = row.version + 1;
  const resetJson = JSON.stringify(INITIAL_STATE);

  const updateRes = db
    .prepare("UPDATE user_states SET state_json = ?, version = ? WHERE user_id = ? AND version = ?")
    .run(resetJson, nextVersion, userId, expectedVersion);

  if (updateRes.changes === 0) {
    throw new AuthError(409, "STATE_CONFLICT", "Конфликт параллельной записи. Обновите состояние");
  }

  return {
    state: INITIAL_STATE,
    version: nextVersion,
  };
}
