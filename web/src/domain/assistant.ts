import type {
  BarrierReason,
  FaqId,
  RuleResult,
  TaskId,
  TaskDefinition,
  Template,
  TemplateId,
} from "./types";
import { TEMPLATES } from "../data/templates";
import { BARRIER_RULES } from "../data/rules";
import { SOURCES } from "../data/sources";

export function resolveRule(
  templateId: TemplateId,
  taskId: TaskId,
  reason: BarrierReason,
  today: string
): RuleResult {
  const template = TEMPLATES[templateId];
  if (!template) {
    return {
      kind: "unavailable",
      message: "Учебная памятка не найдена",
    };
  }

  const task = template.tasks.find((t) => t.id === taskId);
  if (!task || task.kind !== "organization") {
    return {
      kind: "unavailable",
      message: "У этой учебной задачи нет организационных препятствий",
    };
  }

  const rule = BARRIER_RULES[reason];
  if (!rule) {
    return {
      kind: "unavailable",
      message:
        "Проверенной подсказки для этого случая нет. Уточните организационный порядок у выдавшего памятку специалиста",
    };
  }

  const source = SOURCES[rule.sourceId];
  if (!source) {
    return {
      kind: "unavailable",
      message: "Источник учебного правила не найден",
    };
  }

  if (today > source.nextReviewAt) {
    return {
      kind: "expired",
      source,
    };
  }

  return {
    kind: "available",
    rule,
    source,
  };
}

export function makeDraft(
  template: Template,
  task: TaskDefinition,
  reason: BarrierReason
): string {
  const reasonText =
    reason === "no_slots"
      ? "нет свободной записи или талонов"
      : reason === "unclear_process"
      ? "непонятен порядок действий или куда обращаться"
      : "нет ответа по указанному каналу";

  return `Учебный запрос разъяснения — не отправляется.
В демонстрационной памятке «${template.title}» есть шаг «${task.title}».
Препятствие: ${reasonText}.
Подскажите, пожалуйста, какой организационный шаг доступен для этого учебного случая.
Это вымышленный пример, он не содержит сведений реального пациента.`;
}

export const FAQ_ITEMS: { id: FaqId; question: string }[] = [
  { id: "today", question: "Что делать сегодня?" },
  { id: "barrier", question: "Не получается выполнить шаг" },
  { id: "reminder", question: "Придёт ли напоминание при закрытой вкладке?" },
  { id: "medical", question: "Можно изменить назначения или спросить про симптомы?" },
];

const FAQ_ANSWERS: Record<FaqId, { text: string; anchor: string; sourceId: "demo-help-v1" }> = {
  today: {
    text: "Откройте раздел «Сегодня». Там показаны учебные действия на текущую дату. Если задача из предыдущего дня не выполнена, она находится в разделе «Ранее»",
    anchor: "help-today",
    sourceId: "demo-help-v1",
  },
  barrier: {
    text: "У организационной задачи нажмите «Не получается», выберите причину и посмотрите учебную подсказку. Сообщение о препятствии не означает, что задача выполнена",
    anchor: "help-barrier",
    sourceId: "demo-help-v1",
  },
  reminder: {
    text: "Внутри приложения напоминание проверяется, пока оно открыто, и при следующем открытии. Для внешнего календаря скачайте .ics и подтвердите импорт. Приложение не гарантирует доставку календарного уведомления",
    anchor: "help-reminder",
    sourceId: "demo-help-v1",
  },
  medical: {
    text: "Нет. Приложение не оценивает симптомы, не назначает лечение и не меняет назначения. Такие вопросы нужно уточнять у медицинского специалиста",
    anchor: "help-medical",
    sourceId: "demo-help-v1",
  },
};

export function answerFaq(
  templateId: TemplateId,
  faqId: FaqId
): { text: string; anchor: string; sourceId: "demo-help-v1" } | null {
  if (templateId !== "orvi-demo" && templateId !== "vaccine-demo") {
    return null;
  }
  return FAQ_ANSWERS[faqId] ?? null;
}
