import React from "react";
import type { TaskId, TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { useDemo } from "../app/DemoProvider";
import { localDateOf } from "../domain/time";
import { getNextAction, getProgress, getTaskGroups } from "../domain/selectors";

interface PlanPageProps {
  planId: TemplateId;
}

export const PlanPage: React.FC<PlanPageProps> = ({ planId }) => {
  const { state, textMode, setTextMode, isSaving } = useDemo();
  const template = TEMPLATES[planId];

  if (!template) {
    return (
      <div className="page-content">
        <h1>Учебная памятка не найдена</h1>
        <p className="text-muted">Запрошенный план не существует в демонстрационной системе.</p>
        <a href="#/" className="btn-primary">
          Вернуться к выбору памятки
        </a>
      </div>
    );
  }

  const plan = state.plans[planId];
  if (!plan) {
    return (
      <div className="page-content">
        <p>Загрузка учебного плана...</p>
      </div>
    );
  }

  const today = localDateOf(new Date());
  const progress = getProgress(plan, template);
  const groups = getTaskGroups(plan, template, today);
  const nextAction = getNextAction(plan, template);

  const getNextActionBanner = () => {
    if (nextAction.kind === "complete") {
      return (
        <div className="card" style={{ background: "#E8F5E9", borderColor: "#C8E6C9" }}>
          <strong style={{ color: "#2E7D32" }}>✓ Все учебные действия выполнены</strong>
          <p style={{ margin: "4px 0 0 0", fontSize: "16px", color: "var(--text)" }}>
            Вы успешно завершили все запланированные организационные шаги памятки.
          </p>
        </div>
      );
    }

    const task = template.tasks.find((t) => t.id === nextAction.taskId);
    if (!task) return null;

    if (nextAction.kind === "barrier") {
      return (
        <div className="card" style={{ background: "#FFF3E0", borderColor: "#FFE0B2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "#E65100" }}>⚠ Требуется решение препятствия</strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "16px" }}>
                Задача: {task.title}
              </p>
            </div>
            <a href={`#/plan/${planId}/task/${task.id}/barrier`} className="btn-primary">
              Открыть помощь
            </a>
          </div>
        </div>
      );
    }

    if (nextAction.kind === "waiting") {
      return (
        <div className="card" style={{ background: "#EDE7F6", borderColor: "#D1C4E9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "#512DA8" }}>⏳ Ожидание ответа</strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "16px" }}>
                Задача: {task.title}
              </p>
            </div>
            <a href={`#/plan/${planId}/task/${task.id}`} className="btn-primary">
              К задаче
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="card" style={{ background: "#E8F1F5", borderColor: "#B8CDD8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong style={{ color: "var(--accent)" }}>Следующий шаг плана</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "16px" }}>
              {task.order}. {task.title}
            </p>
          </div>
          <a href={`#/plan/${planId}/task/${task.id}`} className="btn-primary">
            Перейти к шагу
          </a>
        </div>
      </div>
    );
  };

  const renderTaskItem = (taskId: TaskId) => {
    const task = template.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    const taskState = plan.tasks[taskId];
    const isDone = taskState?.status === "done";

    return (
      <li key={taskId} className="task-item">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div className="task-item-title">
              <a href={`#/plan/${planId}/task/${taskId}`} style={{ textDecoration: "none", color: "inherit" }}>
                {task.order}. {task.title}
              </a>
            </div>
            <p className="task-item-desc">
              {textMode === "simple" ? task.simpleText : task.originalText}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <span
              className="badge"
              style={{
                fontSize: "14px",
                background: isDone ? "#E8F5E9" : undefined,
                color: isDone ? "#1B5E20" : undefined,
              }}
            >
              {isDone ? "✓ Выполнено" : taskState?.status === "blocked" ? "⚠ Препятствие" : taskState?.status === "waiting" ? "⏳ Ожидание" : "В работе"}
            </span>
            <a
              href={`#/plan/${planId}/task/${taskId}`}
              style={{ fontSize: "16px", minHeight: "36px" }}
            >
              Открыть →
            </a>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: "16px" }}>
        <a href="#/">← Выбрать другую памятку</a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "8px" }}>
        <div>
          <h1 style={{ fontSize: "28px", margin: "0 0 8px 0" }}>{template.title}</h1>
          <p className="text-muted" style={{ fontSize: "16px", margin: 0 }}>
            Без лечения и клинических рекомендаций: только учебные организационные действия
          </p>
        </div>
        <div className="badge" style={{ whiteSpace: "nowrap" }}>
          Выполнено {progress.done} из {progress.total}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0" }}>
        <span className="text-muted" style={{ fontSize: "16px" }}>
          Дата начала плана: {plan.startedOn}
        </span>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setTextMode(textMode === "simple" ? "original" : "simple")}
          style={{ fontSize: "14px", padding: "6px 12px", minHeight: "36px" }}
        >
          {textMode === "simple" ? "Режим: Простой текст (переключить)" : "Режим: Исходный текст (переключить)"}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
        <a
          href={`#/plan/${planId}/faq`}
          style={{
            padding: "8px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--accent)",
            textDecoration: "none",
            minHeight: "44px",
            display: "inline-flex",
            alignItems: "center",
            fontWeight: 500,
          }}
        >
          Ответы по памятке
        </a>
        <a
          href={`#/plan/${planId}/faq`}
          style={{
            fontSize: "16px",
            color: "var(--accent)",
            minHeight: "44px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Проверить следующий шаг →
        </a>
      </div>

      {getNextActionBanner()}

      {groups.today.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Сегодня</h2>
          <ul className="task-list">{groups.today.map(renderTaskItem)}</ul>
        </section>
      )}

      {groups.tomorrow.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Завтра</h2>
          <ul className="task-list">{groups.tomorrow.map(renderTaskItem)}</ul>
        </section>
      )}

      {groups.earlier.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px", color: "var(--muted)" }}>Ранее</h2>
          <ul className="task-list">{groups.earlier.map(renderTaskItem)}</ul>
        </section>
      )}

      {groups.later.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px", color: "var(--muted)" }}>Позже</h2>
          <ul className="task-list">{groups.later.map(renderTaskItem)}</ul>
        </section>
      )}

      {groups.done.length > 0 && (
        <section style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px", color: "#2E7D32" }}>
            Выполненные действия ({groups.done.length})
          </h2>
          <ul className="task-list">{groups.done.map(renderTaskItem)}</ul>
        </section>
      )}
    </div>
  );
};
