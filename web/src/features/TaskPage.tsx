import React, { useState } from "react";
import type { TaskId, TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { useDemo } from "../app/DemoProvider";
import { addCalendarDays, parseLocalReminder } from "../domain/time";
import { makeCalendarEvent } from "../platform/calendar";
import { downloadCalendarFile } from "../platform/download";

interface TaskPageProps {
  planId: TemplateId;
  taskId: TaskId;
}

const REASON_LABELS: Record<string, string> = {
  no_slots: "Нет записи",
  unclear_process: "Не понимаю порядок",
  no_response: "Нет ответа",
};

const OUTCOME_LABELS: Record<string, string> = {
  waiting: "Ожидание ответа",
  persists: "Проблема сохраняется",
  resolved: "Решено",
};

function getDefaultReminderInput(): string {
  const dt = new Date(Date.now() + 30 * 60 * 1000);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const TaskPage: React.FC<TaskPageProps> = ({ planId, taskId }) => {
  const { state, dispatch, textMode, setTextMode, isSaving } = useDemo();
  const [reminderInput, setReminderInput] = useState<string>(getDefaultReminderInput);
  const [reminderError, setReminderError] = useState<string | null>(null);

  const template = TEMPLATES[planId];

  if (!template) {
    return (
      <div className="page-content">
        <h1>Учебный план не найден</h1>
        <a href="#/" className="btn-primary">
          Вернуться на главную
        </a>
      </div>
    );
  }

  const taskDef = template.tasks.find((t) => t.id === taskId);
  if (!taskDef) {
    return (
      <div className="page-content">
        <h1>Учебная задача не найдена</h1>
        <a href={`#/plan/${planId}`} className="btn-primary">
          Вернуться к памятке
        </a>
      </div>
    );
  }

  const plan = state.plans[planId];
  const taskState = plan?.tasks[taskId];
  const isDone = taskState?.status === "done";
  const targetDate = plan ? addCalendarDays(plan.startedOn, taskDef.dayOffset) : "";

  const handleToggleComplete = () => {
    const now = new Date().toISOString();
    if (isDone) {
      dispatch({ type: "REOPEN_TASK", planId, taskId, now });
    } else {
      dispatch({ type: "COMPLETE_TASK", planId, taskId, now });
    }
  };

  const handleSaveReminder = () => {
    setReminderError(null);
    const now = new Date();
    const res = parseLocalReminder(reminderInput, now);
    if (!res.ok) {
      setReminderError(res.message);
      return;
    }
    dispatch({
      type: "SET_REMINDER",
      planId,
      taskId,
      at: res.at,
      now: now.toISOString(),
    });
  };

  const handleCancelReminder = () => {
    dispatch({
      type: "CANCEL_REMINDER",
      planId,
      taskId,
    });
  };

  const handleExportIcs = () => {
    if (!taskState?.reminder) return;
    const now = new Date().toISOString();
    const ics = makeCalendarEvent({
      planId,
      taskId,
      at: taskState.reminder.at,
      createdAt: now,
    });
    downloadCalendarFile(`marshrut-${planId}-${taskId}.ics`, ics);
  };

  const getStatusLabel = () => {
    if (!taskState) return "Не начато";
    switch (taskState.status) {
      case "done":
        return "✓ Выполнено";
      case "blocked":
        return "⚠ Препятствие";
      case "waiting":
        return "⏳ Ожидание ответа";
      case "pending":
      default:
        return "В процессе";
    }
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: "16px" }}>
        <a href={`#/plan/${planId}`}>← К списку действий памятки</a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span className="badge">
          {taskDef.kind === "organization" ? "Организационное действие" : "Информационный шаг"}
        </span>
        <span
          className="badge"
          style={{ background: isDone ? "#E8F5E9" : undefined, color: isDone ? "#1B5E20" : undefined }}
        >
          {getStatusLabel()}
        </span>
      </div>

      <h1 style={{ fontSize: "26px", margin: "12px 0 8px 0" }}>
        {taskDef.order}. {taskDef.title}
      </h1>

      {targetDate && (
        <p className="text-muted" style={{ margin: "0 0 16px 0", fontSize: "16px" }}>
          Целевой день: {targetDate} ({taskDef.dayOffset === 0 ? "день старта" : `+${taskDef.dayOffset} дн.`})
        </p>
      )}

      {taskState?.barrier && (
        <div
          style={{
            background: taskState.barrier.closedAt === null ? "#FFF3E0" : "#E8F5E9",
            border: `1px solid ${taskState.barrier.closedAt === null ? "#FFE0B2" : "#C8E6C9"}`,
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "15px",
          }}
        >
          <div style={{ fontWeight: 600, color: taskState.barrier.closedAt === null ? "#E65100" : "#2E7D32" }}>
            {taskState.barrier.closedAt === null ? "⚠ Препятствие" : "✓ Препятствие решено"}:{" "}
            {REASON_LABELS[taskState.barrier.reason] ?? taskState.barrier.reason}
            {taskState.barrier.outcome && (
              <span style={{ marginLeft: "8px", fontWeight: "normal", color: "var(--muted)" }}>
                ({OUTCOME_LABELS[taskState.barrier.outcome] ?? taskState.barrier.outcome})
              </span>
            )}
          </div>
          {taskState.barrier.closedAt === null && (
            <div style={{ marginTop: "6px" }}>
              <a href={`#/plan/${planId}/task/${taskId}/barrier`} style={{ fontSize: "14px" }}>
                Открыть подсказку и черновик →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <strong style={{ fontSize: "16px", color: "var(--muted)" }}>
            {textMode === "simple" ? "Простой понятный текст" : "Исходная формулировка"}
          </strong>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setTextMode(textMode === "simple" ? "original" : "simple")}
            style={{ fontSize: "14px", padding: "4px 10px", minHeight: "36px" }}
          >
            {textMode === "simple" ? "Показать оригинал" : "Показать понятный текст"}
          </button>
        </div>

        <p style={{ fontSize: "18px", margin: 0, lineHeight: 1.6 }}>
          {textMode === "simple" ? taskDef.simpleText : taskDef.originalText}
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "20px" }}>
        <button
          type="button"
          disabled={isSaving}
          onClick={handleToggleComplete}
          className={isDone ? "" : "btn-primary"}
        >
          {isDone ? "Отменить отметку о выполнении" : "Отметить как выполненное"}
        </button>

        {taskDef.kind === "organization" && !isDone && (
          <a
            href={`#/plan/${planId}/task/${taskId}/barrier`}
            style={{
              padding: "8px 16px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--accent)",
              textDecoration: "none",
              background: "var(--surface)",
              minHeight: "44px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {taskState?.barrier && taskState.barrier.closedAt === null ? "Управление препятствием" : "Не получается"}
          </a>
        )}
      </div>

      <div className="card" style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "12px" }}>
          Напоминание по действию
        </h2>

        {isDone ? (
          <p className="text-muted" style={{ margin: 0 }}>
            Задача уже отмечена выполненной.
          </p>
        ) : taskState?.reminder ? (
          <div>
            <p style={{ margin: "0 0 12px 0", fontSize: "16px" }}>
              Напоминание установлено на:{" "}
              <strong>{formatDateTime(taskState.reminder.at)}</strong>
            </p>

            {taskState.reminder.firedAt && (
              <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "15px" }}>
                Напоминание было: {formatDateTime(taskState.reminder.firedAt)}
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <button type="button" disabled={isSaving} onClick={handleCancelReminder}>
                Отменить напоминание
              </button>
              <button type="button" className="btn-primary" onClick={handleExportIcs}>
                Добавить в календарь (.ics)
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: "14px", marginTop: "12px", marginBottom: 0 }}>
              Скачайте файл и подтвердите добавление в своём календаре. Доставка зависит от настроек календаря.
            </p>
          </div>
        ) : (
          <div>
            {taskState?.reminder?.firedAt && (
              <p style={{ margin: "0 0 12px 0", color: "var(--muted)", fontSize: "15px" }}>
                Напоминание было: {formatDateTime(taskState.reminder.firedAt)}
              </p>
            )}

            <p className="text-muted" style={{ fontSize: "15px", marginTop: 0, marginBottom: "12px" }}>
              Выберите удобные дату и время напоминания. Приложение проверит напоминание, пока оно открыто.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <input
                type="datetime-local"
                value={reminderInput}
                onChange={(e) => setReminderInput(e.target.value)}
                style={{
                  fontSize: "16px",
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  minHeight: "44px",
                  fontFamily: "inherit",
                }}
              />
              <button type="button" disabled={isSaving} className="btn-primary" onClick={handleSaveReminder}>
                Сохранить напоминание
              </button>
            </div>

            {reminderError && (
              <p style={{ color: "#D32F2F", marginTop: "8px", marginBottom: 0, fontSize: "15px" }}>
                {reminderError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
