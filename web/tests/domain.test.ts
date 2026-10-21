import { describe, expect, it } from "vitest";
import { INITIAL_STATE, reduceDemo } from "../src/domain/reducer";
import { buildTemplateLink, getInsights, getNextAction, getProgress } from "../src/domain/selectors";
import { TEMPLATES } from "../src/data/templates";
import { resolveRule, makeDraft, answerFaq } from "../src/domain/assistant";
import type { FaqId, TemplateId } from "../src/domain/types";

describe("domain reducer and selectors", () => {
  it("OPEN orvi, COMPLETE read twice, REOPEN read", () => {
    let state = INITIAL_STATE;
    const now1 = "2026-10-21T10:00:00.000Z";
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: now1,
      localDate: "2026-10-21",
    });

    expect(state.activePlanId).toBe("orvi-demo");
    expect(state.plans["orvi-demo"]).toBeDefined();
    expect(state.events).toHaveLength(1);
    expect(state.events[0].kind).toBe("plan_opened");

    const template = TEMPLATES["orvi-demo"];
    expect(getProgress(state.plans["orvi-demo"]!, template)).toEqual({ done: 0, total: 4 });

    // COMPLETE read first time
    const now2 = "2026-10-21T10:05:00.000Z";
    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "read",
      now: now2,
    });

    expect(getProgress(state.plans["orvi-demo"]!, template)).toEqual({ done: 1, total: 4 });
    expect(state.events).toHaveLength(2);
    expect(state.events[1].kind).toBe("task_completed");
    expect(state.events[1].taskId).toBe("read");

    // COMPLETE read second time -> identity
    const prevState = state;
    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "read",
      now: "2026-10-21T10:06:00.000Z",
    });
    expect(state).toBe(prevState);
    expect(state.events).toHaveLength(2);

    // REOPEN read
    const now3 = "2026-10-21T10:10:00.000Z";
    state = reduceDemo(state, {
      type: "REOPEN_TASK",
      planId: "orvi-demo",
      taskId: "read",
      now: now3,
    });

    expect(getProgress(state.plans["orvi-demo"]!, template)).toEqual({ done: 0, total: 4 });
    expect(state.events).toHaveLength(3);
    expect(state.events[2].kind).toBe("task_reopened");
    expect(state.events[2].taskId).toBe("read");
  });

  it("maintains independence between different plans", () => {
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "read",
      now: "2026-10-21T10:05:00.000Z",
    });

    expect(getProgress(state.plans["orvi-demo"]!, TEMPLATES["orvi-demo"])).toEqual({ done: 1, total: 4 });

    // Open vaccine-demo
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "vaccine-demo",
      now: "2026-10-21T10:10:00.000Z",
      localDate: "2026-10-21",
    });

    expect(state.activePlanId).toBe("vaccine-demo");
    expect(getProgress(state.plans["vaccine-demo"]!, TEMPLATES["vaccine-demo"])).toEqual({ done: 0, total: 4 });
    expect(getProgress(state.plans["orvi-demo"]!, TEMPLATES["orvi-demo"])).toEqual({ done: 1, total: 4 });

    // Switch back to orvi-demo
    const startedOnOrvi = state.plans["orvi-demo"]!.startedOn;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:15:00.000Z",
      localDate: "2026-10-21",
    });

    expect(state.activePlanId).toBe("orvi-demo");
    expect(state.plans["orvi-demo"]!.startedOn).toBe(startedOnOrvi);
    expect(getProgress(state.plans["orvi-demo"]!, TEMPLATES["orvi-demo"])).toEqual({ done: 1, total: 4 });
  });

  it("rejects REPORT_BARRIER on info task", () => {
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    const prevState = state;
    // 'read' is info task
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "read",
      reason: "no_slots",
      now: "2026-10-21T10:05:00.000Z",
    });

    expect(state).toBe(prevState);
  });

  it("handles barrier lifecycle: blocked -> waiting -> blocked -> pending -> done", () => {
    let state = INITIAL_STATE;
    const template = TEMPLATES["orvi-demo"];
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // Report barrier on followup (organization task)
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "followup",
      reason: "no_slots",
      now: "2026-10-21T10:05:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.followup?.status).toBe("blocked");
    expect(getProgress(state.plans["orvi-demo"]!, template).done).toBe(0);

    // Record waiting outcome
    state = reduceDemo(state, {
      type: "RECORD_OUTCOME",
      planId: "orvi-demo",
      taskId: "followup",
      outcome: "waiting",
      now: "2026-10-21T10:10:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.followup?.status).toBe("waiting");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.outcome).toBe("waiting");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.closedAt).toBeNull();
    expect(getProgress(state.plans["orvi-demo"]!, template).done).toBe(0);

    // Record persists outcome
    state = reduceDemo(state, {
      type: "RECORD_OUTCOME",
      planId: "orvi-demo",
      taskId: "followup",
      outcome: "persists",
      now: "2026-10-21T10:15:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.followup?.status).toBe("blocked");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.outcome).toBe("persists");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.closedAt).toBeNull();
    expect(getProgress(state.plans["orvi-demo"]!, template).done).toBe(0);

    // Record resolved outcome -> pending
    state = reduceDemo(state, {
      type: "RECORD_OUTCOME",
      planId: "orvi-demo",
      taskId: "followup",
      outcome: "resolved",
      now: "2026-10-21T10:20:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.followup?.status).toBe("pending");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.outcome).toBe("resolved");
    expect(state.plans["orvi-demo"]!.tasks.followup?.barrier?.closedAt).toBe("2026-10-21T10:20:00.000Z");
    expect(getProgress(state.plans["orvi-demo"]!, template).done).toBe(0);

    // Complete task -> done
    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "followup",
      now: "2026-10-21T10:25:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.followup?.status).toBe("done");
    expect(getProgress(state.plans["orvi-demo"]!, template).done).toBe(1);
  });

  it("closes open barrier with resolved outcome when completing task directly", () => {
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
      reason: "unclear_process",
      now: "2026-10-21T10:05:00.000Z",
    });

    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:10:00.000Z",
    });

    const contactTask = state.plans["orvi-demo"]!.tasks.contact!;
    expect(contactTask.status).toBe("done");
    expect(contactTask.barrier?.outcome).toBe("resolved");
    expect(contactTask.barrier?.closedAt).toBe("2026-10-21T10:10:00.000Z");

    // Emitted both task_completed and outcome_recorded events
    const lastTwo = state.events.slice(-2);
    expect(lastTwo[0].kind).toBe("task_completed");
    expect(lastTwo[1].kind).toBe("outcome_recorded");
    expect(lastTwo[1].outcome).toBe("resolved");
  });

  it("handles repeated reason as identity and allows switching to another reason", () => {
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

    const revAfterFirst = state.revision;
    const eventsAfterFirst = state.events.length;

    // Report same reason
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "contact",
      reason: "no_slots",
      now: "2026-10-21T10:06:00.000Z",
    });
    expect(state.revision).toBe(revAfterFirst);
    expect(state.events.length).toBe(eventsAfterFirst);

    // Switch reason to unclear_process
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "contact",
      reason: "unclear_process",
      now: "2026-10-21T10:07:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.barrier?.reason).toBe("unclear_process");
    expect(state.events.filter((e) => e.kind === "barrier_reported")).toHaveLength(2);
  });

  it("NextAction selection prioritizes blocked, then pending, then waiting, then complete", () => {
    const template = TEMPLATES["orvi-demo"];
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // Initially read is pending (dayOffset: 0, order: 1)
    expect(getNextAction(state.plans["orvi-demo"]!, template)).toEqual({ kind: "task", taskId: "read" });

    // Block followup (dayOffset: 1)
    state = reduceDemo(state, {
      type: "REPORT_BARRIER",
      planId: "orvi-demo",
      taskId: "followup",
      reason: "no_slots",
      now: "2026-10-21T10:05:00.000Z",
    });

    // Blocked task takes highest priority across all remaining
    expect(getNextAction(state.plans["orvi-demo"]!, template)).toEqual({ kind: "barrier", taskId: "followup" });

    // Resolve followup -> pending
    state = reduceDemo(state, {
      type: "RECORD_OUTCOME",
      planId: "orvi-demo",
      taskId: "followup",
      outcome: "resolved",
      now: "2026-10-21T10:10:00.000Z",
    });

    // Now first pending by dayOffset/order is read
    expect(getNextAction(state.plans["orvi-demo"]!, template)).toEqual({ kind: "task", taskId: "read" });

    // Complete all tasks
    for (const t of template.tasks) {
      state = reduceDemo(state, {
        type: "COMPLETE_TASK",
        planId: "orvi-demo",
        taskId: t.id,
        now: "2026-10-21T10:20:00.000Z",
      });
    }

    expect(getNextAction(state.plans["orvi-demo"]!, template)).toEqual({ kind: "complete" });
  });

  it("caps events at 500 while maintaining monotonic nextEventId", () => {
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // Generate > 500 events alternating complete/reopen
    for (let i = 0; i < 260; i++) {
      const nowStr = `2026-10-21T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`;
      state = reduceDemo(state, {
        type: "COMPLETE_TASK",
        planId: "orvi-demo",
        taskId: "read",
        now: nowStr,
      });
      state = reduceDemo(state, {
        type: "REOPEN_TASK",
        planId: "orvi-demo",
        taskId: "read",
        now: nowStr,
      });
    }

    expect(state.events.length).toBe(500);
    expect(state.nextEventId).toBeGreaterThan(520);
    // Ensure ids in state.events are strictly increasing
    for (let i = 1; i < state.events.length; i++) {
      expect(state.events[i].id).toBeGreaterThan(state.events[i - 1].id);
    }
  });

  it("SET_REMINDER, FIRE, COMPLETE, REOPEN", () => {
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // Set reminder
    const at = "2026-10-21T10:30:00.000Z";
    state = reduceDemo(state, {
      type: "SET_REMINDER",
      planId: "orvi-demo",
      taskId: "contact",
      at,
      now: "2026-10-21T10:00:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.reminder).toEqual({ at, firedAt: null });

    // Fire before due -> identity
    state = reduceDemo(state, {
      type: "FIRE_REMINDER",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:29:59.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.reminder?.firedAt).toBeNull();

    // Fire at due time
    state = reduceDemo(state, {
      type: "FIRE_REMINDER",
      planId: "orvi-demo",
      taskId: "contact",
      now: at,
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.reminder?.firedAt).toBe(at);

    // Fire again -> identity
    const prevRev = state.revision;
    state = reduceDemo(state, {
      type: "FIRE_REMINDER",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:35:00.000Z",
    });
    expect(state.revision).toBe(prevRev);

    // Complete task -> reminder cleared to null
    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:40:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.reminder).toBeNull();

    // Reopen task -> reminder remains null
    state = reduceDemo(state, {
      type: "REOPEN_TASK",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:45:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.tasks.contact?.reminder).toBeNull();
  });

  it("quiz records first and current answers accurately", () => {
    let state = INITIAL_STATE;
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "orvi-demo",
      now: "2026-10-21T10:00:00.000Z",
      localDate: "2026-10-21",
    });

    // Answer incorrect first
    state = reduceDemo(state, {
      type: "ANSWER_QUIZ",
      planId: "orvi-demo",
      answer: "incorrect",
      now: "2026-10-21T10:05:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.quizFirst).toBe("incorrect");
    expect(state.plans["orvi-demo"]!.quizCurrent).toBe("incorrect");
    expect(state.events.filter((e) => e.kind === "quiz_answered")).toHaveLength(1);

    // Answer correct second
    state = reduceDemo(state, {
      type: "ANSWER_QUIZ",
      planId: "orvi-demo",
      answer: "correct",
      now: "2026-10-21T10:10:00.000Z",
    });
    expect(state.plans["orvi-demo"]!.quizFirst).toBe("incorrect");
    expect(state.plans["orvi-demo"]!.quizCurrent).toBe("correct");
    expect(state.events.filter((e) => e.kind === "quiz_answered")).toHaveLength(2);

    // Repeat same answer -> identity / no new event
    const prevRev = state.revision;
    state = reduceDemo(state, {
      type: "ANSWER_QUIZ",
      planId: "orvi-demo",
      answer: "correct",
      now: "2026-10-21T10:15:00.000Z",
    });
    expect(state.revision).toBe(prevRev);
    expect(state.events.filter((e) => e.kind === "quiz_answered")).toHaveLength(2);
  });

  it("answerFaq returns correct answers for allowlisted questions and null for unknown", () => {
    const faqToday = answerFaq("orvi-demo", "today");
    expect(faqToday).not.toBeNull();
    expect(faqToday?.sourceId).toBe("demo-help-v1");
    expect(faqToday?.anchor).toBe("help-today");
    expect(faqToday?.text).toContain("Откройте раздел «Сегодня»");

    const faqBarrier = answerFaq("orvi-demo", "barrier");
    expect(faqBarrier).not.toBeNull();
    expect(faqBarrier?.sourceId).toBe("demo-help-v1");
    expect(faqBarrier?.anchor).toBe("help-barrier");
    expect(faqBarrier?.text).toContain("У организационной задачи нажмите «Не получается»");

    const faqReminder = answerFaq("vaccine-demo", "reminder");
    expect(faqReminder).not.toBeNull();
    expect(faqReminder?.sourceId).toBe("demo-help-v1");
    expect(faqReminder?.anchor).toBe("help-reminder");
    expect(faqReminder?.text).toContain("Внутри приложения напоминание проверяется");

    const faqMedical = answerFaq("vaccine-demo", "medical");
    expect(faqMedical).not.toBeNull();
    expect(faqMedical?.sourceId).toBe("demo-help-v1");
    expect(faqMedical?.anchor).toBe("help-medical");
    expect(faqMedical?.text).toContain("Приложение не оценивает симптомы");

    // Unknown FAQ ID or invalid template
    expect(answerFaq("orvi-demo", "unknown" as unknown as FaqId)).toBeNull();
    expect(answerFaq("unknown" as unknown as TemplateId, "today")).toBeNull();
  });

  it("resolveRule handles available, expired, and unavailable cases", () => {
    const resAvailable = resolveRule("orvi-demo", "followup", "no_slots", "2027-01-20");
    expect(resAvailable.kind).toBe("available");
    if (resAvailable.kind === "available") {
      expect(resAvailable.rule.reason).toBe("no_slots");
      expect(resAvailable.source.id).toBe("demo-barriers-v1");
    }

    const resExpired = resolveRule("orvi-demo", "followup", "no_slots", "2027-01-21");
    expect(resExpired.kind).toBe("expired");
    if (resExpired.kind === "expired") {
      expect(resExpired.source.id).toBe("demo-barriers-v1");
    }

    const resUnavailable = resolveRule("orvi-demo", "read", "no_slots", "2026-10-21");
    expect(resUnavailable.kind).toBe("unavailable");
  });

  it("makeDraft creates 5-line read-only query draft", () => {
    const template = TEMPLATES["orvi-demo"];
    const task = template.tasks.find((t) => t.id === "followup")!;
    const draft = makeDraft(template, task, "no_slots");
    const lines = draft.split("\n");

    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("Учебный запрос разъяснения — не отправляется.");
    expect(lines[1]).toBe("В демонстрационной памятке «После ОРВИ — учебная памятка» есть шаг «Уточнить порядок следующего контакта».");
    expect(lines[2]).toBe("Препятствие: нет свободной записи или талонов.");
    expect(lines[3]).toBe("Подскажите, пожалуйста, какой организационный шаг доступен для этого учебного случая.");
    expect(lines[4]).toBe("Это вымышленный пример, он не содержит сведений реального пациента.");
  });

  it("getInsights reports empty state, transitions, and filters by plan", () => {
    // 1. Empty state
    const emptyInsights = getInsights(INITIAL_STATE);
    expect(emptyInsights.plansOpened).toBe(0);
    expect(emptyInsights.tasksDone).toBe(0);
    expect(emptyInsights.tasksTotal).toBe(0);
    expect(emptyInsights.barriersCurrent).toBe(0);
    expect(emptyInsights.reasonsCurrent).toEqual({
      no_slots: 0,
      unclear_process: 0,
      no_response: 0,
    });
    expect(emptyInsights.outcomesLatest).toEqual({
      waiting: 0,
      persists: 0,
      resolved: 0,
    });
    expect(emptyInsights.events).toHaveLength(0);

    // 2. Open orvi, report unclear_process, outcome waiting
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
      reason: "unclear_process",
      now: "2026-10-21T10:05:00.000Z",
    });
    state = reduceDemo(state, {
      type: "RECORD_OUTCOME",
      planId: "orvi-demo",
      taskId: "contact",
      outcome: "waiting",
      now: "2026-10-21T10:10:00.000Z",
    });

    const insightsAfterWaiting = getInsights(state);
    expect(insightsAfterWaiting.plansOpened).toBe(1);
    expect(insightsAfterWaiting.tasksTotal).toBe(4);
    expect(insightsAfterWaiting.tasksDone).toBe(0);
    expect(insightsAfterWaiting.barriersCurrent).toBe(1);
    expect(insightsAfterWaiting.reasonsCurrent.unclear_process).toBe(1);
    expect(insightsAfterWaiting.outcomesLatest.waiting).toBe(1);

    // 3. Mark contact complete
    state = reduceDemo(state, {
      type: "COMPLETE_TASK",
      planId: "orvi-demo",
      taskId: "contact",
      now: "2026-10-21T10:15:00.000Z",
    });

    const insightsAfterComplete = getInsights(state);
    expect(insightsAfterComplete.tasksDone).toBe(1);
    expect(insightsAfterComplete.barriersCurrent).toBe(0);
    expect(insightsAfterComplete.outcomesLatest.resolved).toBe(1);

    // 4. Open vaccine plan and test planId filter
    state = reduceDemo(state, {
      type: "OPEN_PLAN",
      planId: "vaccine-demo",
      now: "2026-10-21T10:20:00.000Z",
      localDate: "2026-10-21",
    });

    const allInsights = getInsights(state);
    expect(allInsights.plansOpened).toBe(2);
    expect(allInsights.tasksTotal).toBe(8);

    const orviOnly = getInsights(state, "orvi-demo");
    expect(orviOnly.plansOpened).toBe(1);
    expect(orviOnly.tasksTotal).toBe(4);
    expect(orviOnly.tasksDone).toBe(1);
    expect(orviOnly.events.every((e) => e.planId === "orvi-demo")).toBe(true);

    const vaccineOnly = getInsights(state, "vaccine-demo");
    expect(vaccineOnly.plansOpened).toBe(1);
    expect(vaccineOnly.tasksTotal).toBe(4);
    expect(vaccineOnly.tasksDone).toBe(0);
    expect(vaccineOnly.events.every((e) => e.planId === "vaccine-demo")).toBe(true);
  });

  it("buildTemplateLink creates valid template URLs", () => {
    const link = buildTemplateLink("http://localhost:5173/?foo=bar#/about", "orvi-demo");
    expect(link).toBe("http://localhost:5173/#/plan/orvi-demo");

    const fallback = buildTemplateLink("not-a-valid-url", "vaccine-demo");
    expect(fallback).toBe("#/plan/vaccine-demo");
  });
});
