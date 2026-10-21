import { describe, expect, it } from "vitest";
import { loadDemo, resetDemo, saveDemo, STORAGE_KEY } from "../src/platform/storage";
import { INITIAL_STATE, reduceDemo } from "../src/domain/reducer";

class MockStorage implements Storage {
  private store = new Map<string, string>();
  public throwOnGet: Error | null = null;
  public throwOnSet: Error | null = null;
  public throwOnRemove: Error | null = null;

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    if (this.throwOnGet) throw this.throwOnGet;
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    if (this.throwOnRemove) throw this.throwOnRemove;
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw this.throwOnSet;
    this.store.set(key, value);
  }
}

describe("storage persistence and validation", () => {
  it("performs round-trip save and load for valid state", () => {
    const storage = new MockStorage();

    // Build a realistic state
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "contact",
      reason: "no_slots",
      now: "2026-10-21T10:05:00.000Z",
    });
    state = reduceDemo(state, {
      type: "SET_REMINDER",
      planId: "orvi-demo",
      taskId: "followup",
      at: "2026-10-21T11:00:00.000Z",
      now: "2026-10-21T10:05:00.000Z",
    });
    state = reduceDemo(state, {
      type: "ANSWER_QUIZ",
      planId: "orvi-demo",
      answer: "correct",
      now: "2026-10-21T10:10:00.000Z",
    });

    const saveRes = saveDemo(storage, state);
    expect(saveRes.ok).toBe(true);

    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("ok");
    if (loadRes.kind === "ok") {
      expect(loadRes.state).toEqual(state);
    }
  });

  it("returns empty when key is not present", () => {
    const storage = new MockStorage();
    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("empty");
  });

  it("returns invalid for broken JSON and does not overwrite key", () => {
    const storage = new MockStorage();
    const brokenData = "invalid-json-{broken";
    storage.setItem(STORAGE_KEY, brokenData);

    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("invalid");
    expect(storage.getItem(STORAGE_KEY)).toBe(brokenData);
  });

  it("returns invalid for unsupported schemaVersion", () => {
    const storage = new MockStorage();
    const badSchema = JSON.stringify({
      ...INITIAL_STATE,
      schemaVersion: 2,
    });
    storage.setItem(STORAGE_KEY, badSchema);

    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("invalid");
  });

  it("returns invalid for unknown task keys", () => {
    const storage = new MockStorage();
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // inject unexpected task
    const stateObj = JSON.parse(JSON.stringify(state));
    stateObj.plans["orvi-demo"].tasks["unknown_task"] = {
      status: "pending",
      doneAt: null,
      barrier: null,
      reminder: null,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(stateObj));

    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("invalid");
  });

  it("returns unavailable when getItem throws SecurityError", () => {
    const storage = new MockStorage();
    storage.throwOnGet = new Error("SecurityError: Access denied");

    const loadRes = loadDemo(storage);
    expect(loadRes.kind).toBe("unavailable");
  });

  it("returns ok: false when setItem throws QuotaExceededError without throwing out", () => {
    const storage = new MockStorage();
    storage.throwOnSet = new Error("QuotaExceededError: storage full");

    const saveRes = saveDemo(storage, INITIAL_STATE);
    expect(saveRes.ok).toBe(false);
  });

  it("resets storage properly and handles errors gracefully", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_STATE));
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();

    const resetRes = resetDemo(storage);
    expect(resetRes.ok).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();

    // When removeItem fails
    storage.throwOnRemove = new Error("SecurityError");
    const failRes = resetDemo(storage);
    expect(failRes.ok).toBe(false);
  });
});
