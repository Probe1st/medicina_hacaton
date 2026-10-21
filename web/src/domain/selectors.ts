import type {
  BarrierReason,
  DemoState,
  Insights,
  NextAction,
  Outcome,
  PlanInstance,
  TaskId,
  Template,
  TemplateId,
} from "./types";
import { addCalendarDays } from "./time";
import { TEMPLATES } from "../data/templates";

export function getProgress(
  plan: PlanInstance,
  template: Template
): { done: number; total: number } {
  const total = template.tasks.length;
  let done = 0;
  for (const t of template.tasks) {
    if (plan.tasks[t.id]?.status === "done") {
      done += 1;
    }
  }
  return { done, total };
}

export function getTaskGroups(
  plan: PlanInstance,
  template: Template,
  today: string
): {
  earlier: TaskId[];
  today: TaskId[];
  tomorrow: TaskId[];
  later: TaskId[];
  done: TaskId[];
} {
  const earlier: TaskId[] = [];
  const todayTasks: TaskId[] = [];
  const tomorrowTasks: TaskId[] = [];
  const later: TaskId[] = [];
  const done: TaskId[] = [];

  const tomorrowDate = addCalendarDays(today, 1);
  const sortedTasks = template.tasks.slice().sort((a, b) => a.order - b.order);

  for (const t of sortedTasks) {
    const taskState = plan.tasks[t.id];
    if (taskState?.status === "done") {
      done.push(t.id);
      continue;
    }

    const taskDay = addCalendarDays(plan.startedOn, t.dayOffset);
    if (taskDay < today) {
      earlier.push(t.id);
    } else if (taskDay === today) {
      todayTasks.push(t.id);
    } else if (taskDay === tomorrowDate) {
      tomorrowTasks.push(t.id);
    } else {
      later.push(t.id);
    }
  }

  return {
    earlier,
    today: todayTasks,
    tomorrow: tomorrowTasks,
    later,
    done,
  };
}

export function getNextAction(
  plan: PlanInstance,
  template: Template
): NextAction {
  const remaining = template.tasks
    .slice()
    .sort((a, b) => (a.dayOffset !== b.dayOffset ? a.dayOffset - b.dayOffset : a.order - b.order))
    .filter((t) => plan.tasks[t.id]?.status !== "done");

  const blocked = remaining.find((t) => plan.tasks[t.id]?.status === "blocked");
  if (blocked) {
    return { kind: "barrier", taskId: blocked.id };
  }

  const pending = remaining.find((t) => plan.tasks[t.id]?.status === "pending");
  if (pending) {
    return { kind: "task", taskId: pending.id };
  }

  const waiting = remaining.find((t) => plan.tasks[t.id]?.status === "waiting");
  if (waiting) {
    return { kind: "waiting", taskId: waiting.id };
  }

  return { kind: "complete" };
}

export function dueReminders(
  state: DemoState,
  now: string
): { planId: TemplateId; taskId: TaskId }[] {
  const result: { planId: TemplateId; taskId: TaskId }[] = [];

  for (const [planIdStr, plan] of Object.entries(state.plans) as [TemplateId, PlanInstance | undefined][]) {
    if (!plan) continue;
    for (const [taskIdStr, taskState] of Object.entries(plan.tasks) as [TaskId, typeof plan.tasks[TaskId]][]) {
      if (
        taskState &&
        taskState.status !== "done" &&
        taskState.reminder !== null &&
        taskState.reminder.firedAt === null &&
        taskState.reminder.at <= now
      ) {
        result.push({ planId: planIdStr, taskId: taskIdStr });
      }
    }
  }

  return result;
}

export function getInsights(state: DemoState, planId?: TemplateId): Insights {
  const filteredPlans = planId
    ? (state.plans[planId] ? [state.plans[planId]!] : [])
    : (Object.values(state.plans).filter(Boolean) as PlanInstance[]);

  const filteredEvents = planId
    ? state.events.filter((e) => e.planId === planId)
    : state.events;

  let tasksDone = 0;
  let tasksTotal = 0;
  let barriersCurrent = 0;
  const reasonsCurrent: Record<BarrierReason, number> = {
    no_slots: 0,
    unclear_process: 0,
    no_response: 0,
  };
  const outcomesLatest: Record<Outcome, number> = {
    waiting: 0,
    persists: 0,
    resolved: 0,
  };

  let quizFirstCorrect = 0;
  let quizFirstAnswered = 0;

  for (const plan of filteredPlans) {
    const template = TEMPLATES[plan.templateId];
    if (template) {
      tasksTotal += template.tasks.length;
    }
    for (const task of Object.values(plan.tasks)) {
      if (!task) continue;
      if (task.status === "done") {
        tasksDone += 1;
      }
      if (task.barrier && task.barrier.closedAt === null) {
        barriersCurrent += 1;
        reasonsCurrent[task.barrier.reason] += 1;
      }
      if (task.barrier && task.barrier.outcome !== null) {
        outcomesLatest[task.barrier.outcome] += 1;
      }
    }

    if (plan.quizFirst !== null) {
      quizFirstAnswered += 1;
      if (plan.quizFirst === "correct") {
        quizFirstCorrect += 1;
      }
    }
  }

  return {
    plansOpened: filteredPlans.length,
    tasksDone,
    tasksTotal,
    barriersCurrent,
    reasonsCurrent,
    outcomesLatest,
    quizFirstCorrect,
    quizFirstAnswered,
    events: filteredEvents,
  };
}

export function buildTemplateLink(baseUrl: string, id: TemplateId): string {
  try {
    const url = new URL(baseUrl);
    url.search = "";
    url.hash = `#/plan/${id}`;
    return url.toString();
  } catch {
    return `#/plan/${id}`;
  }
}
