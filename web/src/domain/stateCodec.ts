import type {
  DemoEvent,
  DemoState,
  EventKind,
  PlanInstance,
  TaskState,
  TemplateId,
} from "./types";
import { TEMPLATES } from "../data/templates";

export const MAX_STATE_BYTE_SIZE = 256 * 1024; // 256 KiB

export type DecodeResult =
  | { kind: "ok"; state: DemoState }
  | { kind: "invalid"; reason: string };

function isValidDate(str: unknown): boolean {
  if (typeof str !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function isValidISO(str: unknown): boolean {
  if (typeof str !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function hasExactKeys(obj: object, allowed: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return allowed.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function validateTask(
  templateId: TemplateId,
  taskId: string,
  task: unknown
): { valid: true } | { valid: false; reason: string } {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return { valid: false, reason: `Task ${taskId} is not an object` };
  }
  const taskObj = task as Partial<TaskState>;
  if (!hasExactKeys(taskObj, ["status", "doneAt", "barrier", "reminder"])) {
    return { valid: false, reason: `Task ${taskId} has invalid keys` };
  }

  const { status, doneAt, barrier, reminder } = taskObj;
  if (status !== "pending" && status !== "blocked" && status !== "waiting" && status !== "done") {
    return { valid: false, reason: `Task ${taskId} invalid status` };
  }

  if (status === "done") {
    if (!isValidISO(doneAt)) {
      return { valid: false, reason: `Task ${taskId} done status requires doneAt` };
    }
    if (reminder !== null) {
      return { valid: false, reason: `Task ${taskId} done status cannot have reminder` };
    }
  } else {
    if (doneAt !== null) {
      return { valid: false, reason: `Task ${taskId} non-done status must have null doneAt` };
    }
  }

  const template = TEMPLATES[templateId];
  const taskDef = template.tasks.find((t) => t.id === taskId);
  if (!taskDef) {
    return { valid: false, reason: `Task ${taskId} not found in template` };
  }

  if (barrier !== null) {
    if (!barrier || typeof barrier !== "object" || Array.isArray(barrier)) {
      return { valid: false, reason: `Task ${taskId} barrier is not an object` };
    }
    if (!hasExactKeys(barrier, ["reason", "openedAt", "closedAt", "outcome"])) {
      return { valid: false, reason: `Task ${taskId} barrier has invalid keys` };
    }

    if (taskDef.kind !== "organization") {
      return { valid: false, reason: `Task ${taskId} is info task but has barrier` };
    }

    const { reason, openedAt, closedAt, outcome } = barrier;
    if (reason !== "no_slots" && reason !== "unclear_process" && reason !== "no_response") {
      return { valid: false, reason: `Task ${taskId} barrier has invalid reason` };
    }
    if (!isValidISO(openedAt)) {
      return { valid: false, reason: `Task ${taskId} barrier openedAt invalid` };
    }

    if (closedAt === null) {
      if (status !== "blocked" && status !== "waiting") {
        return { valid: false, reason: `Task ${taskId} open barrier requires blocked or waiting status` };
      }
      if (status === "blocked" && outcome !== null && outcome !== "persists") {
        return { valid: false, reason: `Task ${taskId} blocked status outcome mismatch` };
      }
      if (status === "waiting" && outcome !== "waiting") {
        return { valid: false, reason: `Task ${taskId} waiting status outcome mismatch` };
      }
    } else {
      if (!isValidISO(closedAt)) {
        return { valid: false, reason: `Task ${taskId} closed barrier closedAt invalid` };
      }
      if (outcome !== "resolved") {
        return { valid: false, reason: `Task ${taskId} closed barrier must have resolved outcome` };
      }
      if (status !== "done" && status !== "pending") {
        return { valid: false, reason: `Task ${taskId} closed barrier status invalid` };
      }
    }
  } else {
    if (status === "blocked" || status === "waiting") {
      return { valid: false, reason: `Task ${taskId} status ${status} requires open barrier` };
    }
  }

  if (reminder !== null) {
    if (!reminder || typeof reminder !== "object" || Array.isArray(reminder)) {
      return { valid: false, reason: `Task ${taskId} reminder is not an object` };
    }
    if (!hasExactKeys(reminder, ["at", "firedAt"])) {
      return { valid: false, reason: `Task ${taskId} reminder has invalid keys` };
    }
    const { at, firedAt } = reminder;
    if (!isValidISO(at)) {
      return { valid: false, reason: `Task ${taskId} reminder at invalid` };
    }
    if (firedAt !== null) {
      if (!isValidISO(firedAt)) {
        return { valid: false, reason: `Task ${taskId} reminder firedAt invalid` };
      }
      if (firedAt < at) {
        return { valid: false, reason: `Task ${taskId} reminder firedAt earlier than at` };
      }
    }
  }

  return { valid: true };
}

function validatePlan(
  planId: string,
  plan: unknown
): { valid: true } | { valid: false; reason: string } {
  if (planId !== "orvi-demo" && planId !== "vaccine-demo") {
    return { valid: false, reason: `Unknown templateId ${planId}` };
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { valid: false, reason: `Plan ${planId} is not an object` };
  }

  const p = plan as Partial<PlanInstance>;
  if (!hasExactKeys(p, ["templateId", "templateVersion", "startedOn", "tasks", "quizFirst", "quizCurrent"])) {
    return { valid: false, reason: `Plan ${planId} has invalid keys` };
  }

  if (p.templateId !== planId) {
    return { valid: false, reason: `Plan templateId mismatch: ${p.templateId} vs ${planId}` };
  }
  if (p.templateVersion !== "1.0") {
    return { valid: false, reason: `Plan templateVersion unsupported: ${p.templateVersion}` };
  }
  if (!isValidDate(p.startedOn)) {
    return { valid: false, reason: `Plan startedOn invalid: ${p.startedOn}` };
  }

  if (p.quizFirst !== null && p.quizFirst !== "correct" && p.quizFirst !== "incorrect") {
    return { valid: false, reason: `Plan quizFirst invalid` };
  }
  if (p.quizCurrent !== null && p.quizCurrent !== "correct" && p.quizCurrent !== "incorrect") {
    return { valid: false, reason: `Plan quizCurrent invalid` };
  }

  if (!p.tasks || typeof p.tasks !== "object" || Array.isArray(p.tasks)) {
    return { valid: false, reason: `Plan tasks is not an object` };
  }

  const template = TEMPLATES[planId as TemplateId];
  const expectedTaskIds = template.tasks.map((t) => t.id).sort();
  const actualTaskIds = Object.keys(p.tasks).sort();

  if (expectedTaskIds.length !== actualTaskIds.length) {
    return { valid: false, reason: `Plan tasks length mismatch` };
  }
  for (let i = 0; i < expectedTaskIds.length; i++) {
    if (expectedTaskIds[i] !== actualTaskIds[i]) {
      return { valid: false, reason: `Plan tasks keys mismatch: ${actualTaskIds[i]}` };
    }
  }

  for (const taskId of expectedTaskIds) {
    const taskRes = validateTask(planId as TemplateId, taskId, (p.tasks as Record<string, unknown>)[taskId]);
    if (!taskRes.valid) return taskRes;
  }

  return { valid: true };
}

function validateEvent(
  event: unknown,
  plans: Record<string, unknown>,
  prevId: number,
  nextEventId: number
): { valid: true; id: number } | { valid: false; reason: string } {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { valid: false, reason: "Event is not an object" };
  }
  const ev = event as Partial<DemoEvent>;
  if (!hasExactKeys(ev, ["id", "at", "planId", "taskId", "kind", "reason", "outcome", "quiz"])) {
    return { valid: false, reason: "Event has invalid keys" };
  }

  const { id, at, planId, taskId, kind, reason, outcome, quiz } = ev;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= prevId || id >= nextEventId) {
    return { valid: false, reason: `Event id invalid or not strictly ascending: ${id}` };
  }
  if (!isValidISO(at)) {
    return { valid: false, reason: `Event at invalid ISO: ${at}` };
  }
  if (planId !== "orvi-demo" && planId !== "vaccine-demo") {
    return { valid: false, reason: `Event planId unknown: ${planId}` };
  }
  if (!plans[planId]) {
    return { valid: false, reason: `Event references plan that does not exist: ${planId}` };
  }

  const validKinds: EventKind[] = [
    "plan_opened",
    "task_completed",
    "task_reopened",
    "barrier_reported",
    "outcome_recorded",
    "quiz_answered",
  ];
  if (!validKinds.includes(kind as EventKind)) {
    return { valid: false, reason: `Event kind invalid: ${kind}` };
  }

  const template = TEMPLATES[planId as TemplateId];
  if (taskId !== null) {
    if (!template.tasks.some((t) => t.id === taskId)) {
      return { valid: false, reason: `Event taskId does not exist in template: ${taskId}` };
    }
  }

  if (kind === "plan_opened") {
    if (taskId !== null || reason !== null || outcome !== null || quiz !== null) {
      return { valid: false, reason: "plan_opened event must have null fields" };
    }
  } else if (kind === "task_completed" || kind === "task_reopened") {
    if (taskId === null || reason !== null || outcome !== null || quiz !== null) {
      return { valid: false, reason: `${kind} event fields mismatch` };
    }
  } else if (kind === "barrier_reported") {
    if (taskId === null || (reason !== "no_slots" && reason !== "unclear_process" && reason !== "no_response") || outcome !== null || quiz !== null) {
      return { valid: false, reason: "barrier_reported event fields mismatch" };
    }
  } else if (kind === "outcome_recorded") {
    if (taskId === null || (reason !== "no_slots" && reason !== "unclear_process" && reason !== "no_response") || (outcome !== "waiting" && outcome !== "persists" && outcome !== "resolved") || quiz !== null) {
      return { valid: false, reason: "outcome_recorded event fields mismatch" };
    }
  } else if (kind === "quiz_answered") {
    if (taskId !== null || reason !== null || outcome !== null || (quiz !== "correct" && quiz !== "incorrect")) {
      return { valid: false, reason: "quiz_answered event fields mismatch" };
    }
  }

  return { valid: true, id };
}

const textEncoder = new TextEncoder();

export function decodeDemoState(raw: string): DecodeResult {
  const byteLength = textEncoder.encode(raw).byteLength;
  if (byteLength > MAX_STATE_BYTE_SIZE) {
    return { kind: "invalid", reason: "Data exceeds 256 KiB limit" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", reason: "Invalid JSON format" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "invalid", reason: "Root is not an object" };
  }

  const root = parsed as Partial<DemoState>;
  if (!hasExactKeys(root, ["schemaVersion", "revision", "activePlanId", "textMode", "plans", "events", "nextEventId"])) {
    return { kind: "invalid", reason: "Root has invalid keys" };
  }

  if (root.schemaVersion !== 1) {
    return { kind: "invalid", reason: `Unsupported schemaVersion: ${root.schemaVersion}` };
  }

  if (typeof root.revision !== "number" || !Number.isSafeInteger(root.revision) || root.revision < 0) {
    return { kind: "invalid", reason: "Invalid revision" };
  }

  if (typeof root.nextEventId !== "number" || !Number.isSafeInteger(root.nextEventId) || root.nextEventId < 1) {
    return { kind: "invalid", reason: "Invalid nextEventId" };
  }

  if (root.textMode !== "simple" && root.textMode !== "original") {
    return { kind: "invalid", reason: "Invalid textMode" };
  }

  if (root.activePlanId !== null && root.activePlanId !== "orvi-demo" && root.activePlanId !== "vaccine-demo") {
    return { kind: "invalid", reason: "Invalid activePlanId" };
  }

  if (!root.plans || typeof root.plans !== "object" || Array.isArray(root.plans)) {
    return { kind: "invalid", reason: "Plans is not an object" };
  }

  for (const [planId, plan] of Object.entries(root.plans)) {
    const planRes = validatePlan(planId, plan);
    if (!planRes.valid) return { kind: "invalid", reason: planRes.reason };
  }

  if (!Array.isArray(root.events)) {
    return { kind: "invalid", reason: "Events is not an array" };
  }
  if (root.events.length > 500) {
    return { kind: "invalid", reason: "Events array exceeds 500 limit" };
  }

  let prevId = 0;
  for (const event of root.events) {
    const evRes = validateEvent(event, root.plans as Record<string, unknown>, prevId, root.nextEventId);
    if (!evRes.valid) return { kind: "invalid", reason: evRes.reason };
    prevId = evRes.id;
  }

  return {
    kind: "ok",
    state: root as DemoState,
  };
}
