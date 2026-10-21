import type { DemoState } from "../domain/types";
import { decodeDemoState, type DecodeResult } from "../domain/stateCodec";

export const STORAGE_KEY = "marshrut.demo.v1";

export type LoadResult =
  | DecodeResult
  | { kind: "empty" }
  | { kind: "unavailable" };

export function loadDemo(storage: Storage): LoadResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { kind: "unavailable" };
  }

  if (raw === null) {
    return { kind: "empty" };
  }

  return decodeDemoState(raw);
}

export function saveDemo(storage: Storage, state: DemoState): { ok: true } | { ok: false } {
  try {
    const serialized = JSON.stringify(state);
    storage.setItem(STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function resetDemo(storage: Storage): { ok: true } | { ok: false } {
  try {
    storage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
