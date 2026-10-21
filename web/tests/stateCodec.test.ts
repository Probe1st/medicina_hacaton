import { describe, expect, it } from "vitest";
import { decodeDemoState, MAX_STATE_BYTE_SIZE } from "../src/domain/stateCodec";
import { INITIAL_STATE } from "../src/domain/reducer";

describe("stateCodec decodeDemoState", () => {
  it("decodes valid INITIAL_STATE successfully", () => {
    const raw = JSON.stringify(INITIAL_STATE);
    const res = decodeDemoState(raw);
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.state).toEqual(INITIAL_STATE);
    }
  });

  it("rejects invalid JSON syntax", () => {
    const res = decodeDemoState("not json {");
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") {
      expect(res.reason).toBe("Invalid JSON format");
    }
  });

  it("rejects non-object root", () => {
    const res = decodeDemoState(JSON.stringify(["array"]));
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") {
      expect(res.reason).toBe("Root is not an object");
    }
  });

  it("rejects invalid schema version", () => {
    const res = decodeDemoState(JSON.stringify({ ...INITIAL_STATE, schemaVersion: 99 }));
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") {
      expect(res.reason).toContain("Unsupported schemaVersion");
    }
  });

  it("rejects data when UTF-8 byte count exceeds 256 KiB even if string character length is less than 256 KiB (Cyrillic characters test)", () => {
    // 2-byte UTF-8 characters like 'а' (Cyrillic Small Letter A)
    // 150,000 characters:
    // character length = 150,000 (< 256 * 1024 = 262,144)
    // UTF-8 byte length = 300,000 bytes (> 256 * 1024 = 262,144)
    const cyrillicFiller = "а".repeat(150_000);
    expect(cyrillicFiller.length).toBeLessThan(MAX_STATE_BYTE_SIZE);
    expect(new TextEncoder().encode(cyrillicFiller).byteLength).toBeGreaterThan(MAX_STATE_BYTE_SIZE);

    const raw = JSON.stringify({
      ...INITIAL_STATE,
      extra: cyrillicFiller,
    });

    const res = decodeDemoState(raw);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") {
      expect(res.reason).toBe("Data exceeds 256 KiB limit");
    }
  });
});
