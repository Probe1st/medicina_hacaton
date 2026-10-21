export type TemplateId = "orvi-demo" | "vaccine-demo";
export type TaskId = "read" | "contact" | "followup" | "review" | "document";
export type BarrierReason = "no_slots" | "unclear_process" | "no_response";
export type Outcome = "waiting" | "persists" | "resolved";
export type TextMode = "simple" | "original";
export type SourceId = "demo-memos-v1" | "demo-barriers-v1" | "demo-help-v1";
export type RuleId = "rule-no-slots" | "rule-unclear-process" | "rule-no-response";
export type FaqId = "today" | "barrier" | "reminder" | "medical";

export interface ContentSource {
  id: SourceId;
  title: string;
  kind: "demo";
  body: string;
  scope: "Учебный сценарий; не региональный порядок";
  checkedAt: string;             // YYYY-MM-DD e.g. "2026-10-20"
  nextReviewAt: string;          // YYYY-MM-DD e.g. "2027-01-20"
  reviewerRole: "Автор учебного сценария";
  version: "1.0";
  history: readonly string[];
  limitation: string;
}

export interface TaskDefinition {
  id: TaskId;
  order: number;
  dayOffset: 0 | 1;
  kind: "info" | "organization";
  title: string;
  originalText: string;
  simpleText: string;
  sourceId: SourceId;
}

export interface Template {
  id: TemplateId;
  title: string;
  version: "1.0";
  tasks: readonly TaskDefinition[];
  quiz: {
    question: string;
    correct: string;
    incorrect: string;
  };
}

export interface BarrierState {
  reason: BarrierReason;
  openedAt: string;
  closedAt: string | null;
  outcome: Outcome | null;
}

export interface Reminder {
  at: string;
  firedAt: string | null;
}

export interface TaskState {
  status: "pending" | "blocked" | "waiting" | "done";
  doneAt: string | null;
  barrier: BarrierState | null;
  reminder: Reminder | null;
}

export interface PlanInstance {
  templateId: TemplateId;
  templateVersion: "1.0";
  startedOn: string;
  tasks: Partial<Record<TaskId, TaskState>>;
  quizFirst: "correct" | "incorrect" | null;
  quizCurrent: "correct" | "incorrect" | null;
}

export type EventKind =
  | "plan_opened"
  | "task_completed"
  | "task_reopened"
  | "barrier_reported"
  | "outcome_recorded"
  | "quiz_answered";

export interface DemoEvent {
  id: number;
  at: string;
  planId: TemplateId;
  taskId: TaskId | null;
  kind: EventKind;
  reason: BarrierReason | null;
  outcome: Outcome | null;
  quiz: "correct" | "incorrect" | null;
}

export interface DemoState {
  schemaVersion: 1;
  revision: number;
  activePlanId: TemplateId | null;
  textMode: TextMode;
  plans: Partial<Record<TemplateId, PlanInstance>>;
  events: DemoEvent[];
  nextEventId: number;
}

export interface BarrierRule {
  id: RuleId;
  reason: BarrierReason;
  title: string;
  actionText: string;
  sourceId: "demo-barriers-v1";
  limitation: string;
}

export type Action =
  | { type: "OPEN_PLAN"; planId: TemplateId; now: string; localDate: string }
  | { type: "SET_TEXT_MODE"; mode: TextMode }
  | { type: "COMPLETE_TASK"; planId: TemplateId; taskId: TaskId; now: string }
  | { type: "REOPEN_TASK"; planId: TemplateId; taskId: TaskId; now: string }
  | { type: "REPORT_BARRIER"; planId: TemplateId; taskId: TaskId; reason: BarrierReason; now: string }
  | { type: "RECORD_OUTCOME"; planId: TemplateId; taskId: TaskId; outcome: Outcome; now: string }
  | { type: "SET_REMINDER"; planId: TemplateId; taskId: TaskId; at: string; now: string }
  | { type: "CANCEL_REMINDER"; planId: TemplateId; taskId: TaskId }
  | { type: "FIRE_REMINDER"; planId: TemplateId; taskId: TaskId; now: string }
  | { type: "ANSWER_QUIZ"; planId: TemplateId; answer: "correct" | "incorrect"; now: string };

export type RuleResult =
  | { kind: "available"; rule: BarrierRule; source: ContentSource }
  | { kind: "expired"; source: ContentSource }
  | { kind: "unavailable"; message: string };

export type NextAction =
  | { kind: "task"; taskId: TaskId }
  | { kind: "barrier"; taskId: TaskId }
  | { kind: "waiting"; taskId: TaskId }
  | { kind: "complete" };

export interface Insights {
  plansOpened: number;
  tasksDone: number;
  tasksTotal: number;
  barriersCurrent: number;
  reasonsCurrent: Record<BarrierReason, number>;
  outcomesLatest: Record<Outcome, number>;
  quizFirstCorrect: number;
  quizFirstAnswered: number;
  events: readonly DemoEvent[];
}
