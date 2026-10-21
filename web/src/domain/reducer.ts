import type {
  Action,
  DemoEvent,
  DemoState,
  PlanInstance,
  TaskId,
  TaskState,
} from "./types";
import { TEMPLATES } from "../data/templates";

export const INITIAL_STATE: DemoState = {
  schemaVersion: 1,
  revision: 0,
  activePlanId: null,
  textMode: "simple",
  plans: {},
  events: [],
  nextEventId: 1,
};

export function reduceDemo(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "OPEN_PLAN": {
      const template = TEMPLATES[action.planId];
      if (!template) {
        return state;
      }

      const existingPlan = state.plans[action.planId];
      if (existingPlan) {
        if (state.activePlanId === action.planId) {
          return state;
        }
        return {
          ...state,
          revision: state.revision + 1,
          activePlanId: action.planId,
        };
      }

      const initialTasks: Partial<Record<TaskId, TaskState>> = {};
      for (const t of template.tasks) {
        initialTasks[t.id] = {
          status: "pending",
          doneAt: null,
          barrier: null,
          reminder: null,
        };
      }

      const newPlan: PlanInstance = {
        templateId: action.planId,
        templateVersion: "1.0",
        startedOn: action.localDate,
        tasks: initialTasks,
        quizFirst: null,
        quizCurrent: null,
      };

      const event: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: null,
        kind: "plan_opened",
        reason: null,
        outcome: null,
        quiz: null,
      };

      return {
        ...state,
        revision: state.revision + 1,
        activePlanId: action.planId,
        plans: {
          ...state.plans,
          [action.planId]: newPlan,
        },
        events: [...state.events, event].slice(-500),
        nextEventId: state.nextEventId + 1,
      };
    }

    case "SET_TEXT_MODE": {
      if (state.textMode === action.mode) {
        return state;
      }
      return {
        ...state,
        revision: state.revision + 1,
        textMode: action.mode,
      };
    }

    case "COMPLETE_TASK": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || task.status === "done") return state;

      const barrierWasOpen = task.barrier !== null && task.barrier.closedAt === null;
      const updatedBarrier = barrierWasOpen
        ? {
            ...task.barrier!,
            closedAt: action.now,
            outcome: "resolved" as const,
          }
        : task.barrier;

      const updatedTask: TaskState = {
        ...task,
        status: "done",
        doneAt: action.now,
        reminder: null,
        barrier: updatedBarrier,
      };

      const updatedPlan: PlanInstance = {
        ...plan,
        tasks: {
          ...plan.tasks,
          [action.taskId]: updatedTask,
        },
      };

      const eventCompleted: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: action.taskId,
        kind: "task_completed",
        reason: null,
        outcome: null,
        quiz: null,
      };

      const newEvents: DemoEvent[] = [...state.events, eventCompleted];
      let nextId = state.nextEventId + 1;

      if (barrierWasOpen && task.barrier) {
        const eventOutcome: DemoEvent = {
          id: nextId,
          at: action.now,
          planId: action.planId,
          taskId: action.taskId,
          kind: "outcome_recorded",
          reason: task.barrier.reason,
          outcome: "resolved",
          quiz: null,
        };
        newEvents.push(eventOutcome);
        nextId += 1;
      }

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: updatedPlan,
        },
        events: newEvents.slice(-500),
        nextEventId: nextId,
      };
    }

    case "REOPEN_TASK": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || task.status !== "done") return state;

      const updatedTask: TaskState = {
        ...task,
        status: "pending",
        doneAt: null,
        reminder: null,
      };

      const updatedPlan: PlanInstance = {
        ...plan,
        tasks: {
          ...plan.tasks,
          [action.taskId]: updatedTask,
        },
      };

      const event: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: action.taskId,
        kind: "task_reopened",
        reason: null,
        outcome: null,
        quiz: null,
      };

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: updatedPlan,
        },
        events: [...state.events, event].slice(-500),
        nextEventId: state.nextEventId + 1,
      };
    }

    case "REPORT_BARRIER": {
      const template = TEMPLATES[action.planId];
      if (!template) return state;
      const taskDef = template.tasks.find((t) => t.id === action.taskId);
      if (!taskDef || taskDef.kind !== "organization") return state;

      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || task.status === "done") return state;

      if (
        task.barrier !== null &&
        task.barrier.closedAt === null &&
        task.barrier.reason === action.reason
      ) {
        return state;
      }

      const updatedTask: TaskState = {
        ...task,
        status: "blocked",
        doneAt: null,
        barrier: {
          reason: action.reason,
          openedAt: action.now,
          closedAt: null,
          outcome: null,
        },
      };

      const updatedPlan: PlanInstance = {
        ...plan,
        tasks: {
          ...plan.tasks,
          [action.taskId]: updatedTask,
        },
      };

      const event: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: action.taskId,
        kind: "barrier_reported",
        reason: action.reason,
        outcome: null,
        quiz: null,
      };

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: updatedPlan,
        },
        events: [...state.events, event].slice(-500),
        nextEventId: state.nextEventId + 1,
      };
    }

    case "RECORD_OUTCOME": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || !task.barrier || task.barrier.closedAt !== null) return state;

      if (action.outcome === "waiting" && task.status === "waiting" && task.barrier.outcome === "waiting") {
        return state;
      }
      if (action.outcome === "persists" && task.status === "blocked" && task.barrier.outcome === "persists") {
        return state;
      }

      let newStatus = task.status;
      let closedAt: string | null = null;

      if (action.outcome === "waiting") {
        newStatus = "waiting";
      } else if (action.outcome === "persists") {
        newStatus = "blocked";
      } else if (action.outcome === "resolved") {
        newStatus = "pending";
        closedAt = action.now;
      }

      const updatedTask: TaskState = {
        ...task,
        status: newStatus,
        barrier: {
          ...task.barrier,
          outcome: action.outcome,
          closedAt,
        },
      };

      const updatedPlan: PlanInstance = {
        ...plan,
        tasks: {
          ...plan.tasks,
          [action.taskId]: updatedTask,
        },
      };

      const event: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: action.taskId,
        kind: "outcome_recorded",
        reason: task.barrier.reason,
        outcome: action.outcome,
        quiz: null,
      };

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: updatedPlan,
        },
        events: [...state.events, event].slice(-500),
        nextEventId: state.nextEventId + 1,
      };
    }

    case "SET_REMINDER": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || task.status === "done") return state;
      if (action.at <= action.now) return state;

      if (task.reminder && task.reminder.at === action.at && task.reminder.firedAt === null) {
        return state;
      }

      const updatedTask: TaskState = {
        ...task,
        reminder: {
          at: action.at,
          firedAt: null,
        },
      };

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: {
            ...plan,
            tasks: {
              ...plan.tasks,
              [action.taskId]: updatedTask,
            },
          },
        },
      };
    }

    case "CANCEL_REMINDER": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (!task || task.reminder === null) return state;

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: {
            ...plan,
            tasks: {
              ...plan.tasks,
              [action.taskId]: {
                ...task,
                reminder: null,
              },
            },
          },
        },
      };
    }

    case "FIRE_REMINDER": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      const task = plan.tasks[action.taskId];
      if (
        !task ||
        task.status === "done" ||
        task.reminder === null ||
        task.reminder.firedAt !== null ||
        task.reminder.at > action.now
      ) {
        return state;
      }

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: {
            ...plan,
            tasks: {
              ...plan.tasks,
              [action.taskId]: {
                ...task,
                reminder: {
                  ...task.reminder,
                  firedAt: action.now,
                },
              },
            },
          },
        },
      };
    }

    case "ANSWER_QUIZ": {
      const plan = state.plans[action.planId];
      if (!plan) return state;
      if (plan.quizCurrent === action.answer) return state;

      const updatedPlan: PlanInstance = {
        ...plan,
        quizCurrent: action.answer,
        quizFirst: plan.quizFirst === null ? action.answer : plan.quizFirst,
      };

      const event: DemoEvent = {
        id: state.nextEventId,
        at: action.now,
        planId: action.planId,
        taskId: null,
        kind: "quiz_answered",
        reason: null,
        outcome: null,
        quiz: action.answer,
      };

      return {
        ...state,
        revision: state.revision + 1,
        plans: {
          ...state.plans,
          [action.planId]: updatedPlan,
        },
        events: [...state.events, event].slice(-500),
        nextEventId: state.nextEventId + 1,
      };
    }

    default:
      return state;
  }
}
