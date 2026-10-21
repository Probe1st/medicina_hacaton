import { describe, expect, it } from "vitest";
import { escapeIcsText, foldIcsLine, makeCalendarEvent } from "../src/platform/calendar";

describe("calendar RFC 5545 export", () => {
  it("generates valid .ics with correct timestamps, CRLF, and VALARM", () => {
    const at = "2026-10-20T08:30:00.000Z";
    const createdAt = "2026-10-20T08:00:00.000Z";

    const ics = makeCalendarEvent({
      planId: "orvi-demo",
      taskId: "followup",
      at,
      createdAt,
    });

    // Check CRLF
    expect(ics).toContain("\r\n");
    expect(ics.includes("\r\n")).toBe(true);
    // Should not have lone \n without \r
    const withoutCrlf = ics.replace(/\r\n/g, "");
    expect(withoutCrlf.includes("\n")).toBe(false);

    // Timestamps
    expect(ics).toContain("DTSTART:20261020T083000Z");
    expect(ics).toContain("DTEND:20261020T083500Z");
    expect(ics).toContain("DTSTAMP:20261020T080000Z");

    // UID
    expect(ics).toContain("UID:marshrut-orvi-demo-followup-1792485000000@demo.invalid");

    // VALARM
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics).toContain("END:VALARM");
  });

  it("escapes backslashes, semicolons, commas, and newlines in TEXT values", () => {
    const input = "Тест, со спецсимволами; и обратным слэшем \\ и\nпереводом строки";
    const escaped = escapeIcsText(input);

    expect(escaped).toContain("\\,");
    expect(escaped).toContain("\\;");
    expect(escaped).toContain("\\\\");
    expect(escaped).toContain("\\n");
    expect(escaped.includes("\n")).toBe(false);
  });

  it("folds long lines at <= 75 UTF-8 octets and preserves multi-byte characters", () => {
    // Russian characters are 2 UTF-8 bytes each
    const longRussianText = "DESCRIPTION:" + "Очень длинное русское предложение для проверки переноса строки по RFC 5545 в кодировке UTF-8.".repeat(2);
    const folded = foldIcsLine(longRussianText);

    // Split folded output by CRLF
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);

    const encoder = new TextEncoder();
    for (let i = 0; i < lines.length; i++) {
      const lineBytes = encoder.encode(lines[i]).length;
      expect(lineBytes).toBeLessThanOrEqual(75);
      if (i > 0) {
        expect(lines[i].startsWith(" ")).toBe(true);
      }
    }

    // Unfolding (replacing \r\n followed by space) restores the original text
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(longRussianText);
  });

  it("does not break multi-byte characters at byte boundaries", () => {
    // Generate a line whose boundary falls on a multi-byte character
    const prefix = "SUMMARY:"; // 8 bytes
    // Add 33 2-byte characters = 66 bytes -> total 74 bytes.
    // The next 2-byte character would make 76 bytes, exceeding 75.
    const char33 = "Я".repeat(33);
    const charNext = "Ф";
    const line = prefix + char33 + charNext;

    const folded = foldIcsLine(line);
    const lines = folded.split("\r\n");

    expect(lines.length).toBe(2);
    const encoder = new TextEncoder();
    expect(encoder.encode(lines[0]).length).toBeLessThanOrEqual(75);
    expect(encoder.encode(lines[1]).length).toBeLessThanOrEqual(75);

    // Unfolding yields exactly the original line without corruption
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(line);
  });
});
