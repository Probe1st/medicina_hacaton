import type { Action, BarrierReason, Outcome, TaskId, TemplateId, TextMode } from "../../../web/src/domain/types";
import type { ClientAction } from "../../../web/src/domain/authTypes";
import { TEMPLATES } from "../../../web/src/data/templates";
import { reduceDemo } from "../../../web/src/domain/reducer";
import { AuthError } from "../auth/policy";

function hasExactKeys(obj: object, allowed: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return allowed.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function isValidISO(str: unknown): boolean {
  if (typeof str !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

export function validateTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    throw new AuthError(400, "INVALID_REQUEST", "timeZone must be a non-empty string");
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    throw new AuthError(400, "INVALID_REQUEST", `Invalid IANA timeZone: ${timeZone}`);
  }
}

export function formatLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

export function validateAndBuildDomainAction(
  clientAction: unknown,
  timeZone: string,
  serverNowMs: number
): Action {
  if (!clientAction || typeof clientAction !== "object" || Array.isArray(clientAction)) {
    throw new AuthError(400, "INVALID_REQUEST", "Action must be an object");
  }

  const ca = clientAction as Record<string, unknown>;
  const type = ca.type;
  if (typeof type !== "string") {
    throw new AuthError(400, "INVALID_REQUEST", "Action type is required");
  }

  // Reject if client tries to set audit timestamps
  if ("now" in ca || "localDate" in ca) {
    throw new AuthError(400, "INVALID_REQUEST", "Client must not supply 'now' or 'localDate'");
  }

  const serverNowISO = new Date(serverNowMs).toISOString();

  switch (type) {
    case "OPEN_PLAN": {
      if (!hasExactKeys(ca, ["type", "planId"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for OPEN_PLAN");
      }
      const planId = ca.planId as TemplateId;
      if (!TEMPLATES[planId]) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      const localDate = formatLocalDate(new Date(serverNowMs), timeZone);
      return {
        type: "OPEN_PLAN",
        planId,
        now: serverNowISO,
        localDate,
      };
    }

    case "SET_TEXT_MODE": {
      if (!hasExactKeys(ca, ["type", "mode"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for SET_TEXT_MODE");
      }
      const mode = ca.mode as TextMode;
      if (mode !== "simple" && mode !== "original") {
        throw new AuthError(400, "INVALID_REQUEST", `Invalid mode: ${mode}`);
      }
      return {
        type: "SET_TEXT_MODE",
        mode,
      };
    }

    case "COMPLETE_TASK": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for COMPLETE_TASK");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      return {
        type: "COMPLETE_TASK",
        planId,
        taskId: taskId as TaskId,
        now: serverNowISO,
      };
    }

    case "REOPEN_TASK": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for REOPEN_TASK");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      return {
        type: "REOPEN_TASK",
        planId,
        taskId: taskId as TaskId,
        now: serverNowISO,
      };
    }

    case "REPORT_BARRIER": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId", "reason"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for REPORT_BARRIER");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const reason = ca.reason as BarrierReason;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      if (reason !== "no_slots" && reason !== "unclear_process" && reason !== "no_response") {
        throw new AuthError(400, "INVALID_REQUEST", `Invalid barrier reason: ${reason}`);
      }
      return {
        type: "REPORT_BARRIER",
        planId,
        taskId: taskId as TaskId,
        reason,
        now: serverNowISO,
      };
    }

    case "RECORD_OUTCOME": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId", "outcome"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for RECORD_OUTCOME");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const outcome = ca.outcome as Outcome;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      if (outcome !== "waiting" && outcome !== "persists" && outcome !== "resolved") {
        throw new AuthError(400, "INVALID_REQUEST", `Invalid outcome: ${outcome}`);
      }
      return {
        type: "RECORD_OUTCOME",
        planId,
        taskId: taskId as TaskId,
        outcome,
        now: serverNowISO,
      };
    }

    case "SET_REMINDER": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId", "at"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for SET_REMINDER");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const at = ca.at as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      if (!isValidISO(at)) {
        throw new AuthError(400, "INVALID_REQUEST", `Invalid ISO date for reminder at: ${at}`);
      }
      if (new Date(at).getTime() <= serverNowMs) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", "Время напоминания должно быть строго в будущем");
      }
      return {
        type: "SET_REMINDER",
        planId,
        taskId: taskId as TaskId,
        at,
        now: serverNowISO,
      };
    }

    case "CANCEL_REMINDER": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for CANCEL_REMINDER");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      return {
        type: "CANCEL_REMINDER",
        planId,
        taskId: taskId as TaskId,
      };
    }

    case "FIRE_REMINDER": {
      if (!hasExactKeys(ca, ["type", "planId", "taskId"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for FIRE_REMINDER");
      }
      const planId = ca.planId as TemplateId;
      const taskId = ca.taskId as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (!template.tasks.some((t) => t.id === taskId)) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Task ${taskId} not found in template ${planId}`);
      }
      return {
        type: "FIRE_REMINDER",
        planId,
        taskId: taskId as TaskId,
        now: serverNowISO,
      };
    }

    case "ANSWER_QUIZ": {
      if (!hasExactKeys(ca, ["type", "planId", "answer"])) {
        throw new AuthError(400, "INVALID_REQUEST", "Invalid keys for ANSWER_QUIZ");
      }
      const planId = ca.planId as TemplateId;
      const answer = ca.answer as string;
      const template = TEMPLATES[planId];
      if (!template) {
        throw new AuthError(422, "ACTION_NOT_ALLOWED", `Unknown templateId: ${planId}`);
      }
      if (answer !== "correct" && answer !== "incorrect") {
        throw new AuthError(400, "INVALID_REQUEST", `Invalid quiz answer: ${answer}`);
      }
      return {
        type: "ANSWER_QUIZ",
        planId,
        answer,
        now: serverNowISO,
      };
    }

    default:
      throw new AuthError(400, "INVALID_REQUEST", `Unknown action type: ${type}`);
  }
}
