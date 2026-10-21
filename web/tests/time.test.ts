import { describe, expect, it } from "vitest";
import { addCalendarDays, localDateOf, parseLocalReminder } from "../src/domain/time";
import { getTaskGroups } from "../src/domain/selectors";
import { TEMPLATES } from "../src/data/templates";
import type { PlanInstance } from "../src/domain/types";

describe("time and task groups", () => {
  it("groups tasks correctly for startedOn 2026-10-20 and today 2026-10-21", () => {
    const template = TEMPLATES["orvi-demo"];
    const plan: PlanInstance = {
      templateId: "orvi-demo",
      templateVersion: "1.0",
      startedOn: "2026-10-20",
      tasks: {
        read: { status: "done", doneAt: "2026-10-20T10:00:00Z", barrier: null, reminder: null },
        contact: { status: "pending", doneAt: null, barrier: null, reminder: null }, // dayOffset: 0 -> earlier
        followup: { status: "pending", doneAt: null, barrier: null, reminder: null }, // dayOffset: 1 -> today
        review: { status: "pending", doneAt: null, barrier: null, reminder: null }, // dayOffset: 1 -> today
      },
      quizFirst: null,
      quizCurrent: null,
    };

    const groups = getTaskGroups(plan, template, "2026-10-21");

    expect(groups.done).toEqual(["read"]);
    expect(groups.earlier).toEqual(["contact"]);
    expect(groups.today).toEqual(["followup", "review"]);
    expect(groups.tomorrow).toEqual([]);
    expect(groups.later).toEqual([]);
  });

  it("extracts local date correctly without UTC shift", () => {
    // 2026-10-21 00:30 local time
    const d1 = new Date(2026, 9, 21, 0, 30, 0);
    expect(localDateOf(d1)).toBe("2026-10-21");

    // Boundary check: evening local time that may be next day in UTC
    const d2 = new Date(2026, 9, 20, 23, 30, 0);
    expect(localDateOf(d2)).toBe("2026-10-20");
  });

  it("handles addCalendarDays across DST transitions", () => {
    // In America/New_York, DST starts on 2026-03-08 at 02:00 AM
    expect(addCalendarDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("parseLocalReminder validates impossible DST hour, past time, and invalid format", () => {
    const now = new Date("2026-03-07T12:00:00.000Z");

    // Invalid format
    const resInvalid = parseLocalReminder("not-a-date", now);
    expect(resInvalid.ok).toBe(false);
    if (!resInvalid.ok) {
      expect(resInvalid.message).toBe("Выберите корректные дату и время");
    }

    // Past time
    const pastTime = new Date(now.getTime() - 60000);
    const pastY = pastTime.getFullYear();
    const pastM = String(pastTime.getMonth() + 1).padStart(2, "0");
    const pastD = String(pastTime.getDate()).padStart(2, "0");
    const pastH = String(pastTime.getHours()).padStart(2, "0");
    const pastMin = String(pastTime.getMinutes()).padStart(2, "0");
    const resPast = parseLocalReminder(`${pastY}-${pastM}-${pastD}T${pastH}:${pastMin}`, now);
    expect(resPast.ok).toBe(false);
    if (!resPast.ok) {
      expect(resPast.message).toBe("Выберите время в будущем");
    }

    // Impossible DST hour (under America/New_York, 2:30 AM on 2026-03-08 does not exist)
    const isNewYork = Intl.DateTimeFormat().resolvedOptions().timeZone === "America/New_York";
    if (isNewYork) {
      const resImpossible = parseLocalReminder("2026-03-08T02:30", now);
      expect(resImpossible.ok).toBe(false);
      if (!resImpossible.ok) {
        expect(resImpossible.message).toBe("Выберите корректные дату и время");
      }
    }

    // Valid future reminder
    const validFuture = new Date(now.getTime() + 24 * 3600 * 1000);
    const fy = validFuture.getFullYear();
    const fm = String(validFuture.getMonth() + 1).padStart(2, "0");
    const fd = String(validFuture.getDate()).padStart(2, "0");
    const fh = String(validFuture.getHours()).padStart(2, "0");
    const fmin = String(validFuture.getMinutes()).padStart(2, "0");
    const resValid = parseLocalReminder(`${fy}-${fm}-${fd}T${fh}:${fmin}`, now);
    expect(resValid.ok).toBe(true);
    if (resValid.ok) {
      expect(typeof resValid.at).toBe("string");
      expect(typeof resValid.display).toBe("string");
    }
  });
});
