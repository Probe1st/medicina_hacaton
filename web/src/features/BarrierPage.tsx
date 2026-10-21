import React, { useState } from "react";
import type { BarrierReason, TaskId, TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { useDemo } from "../app/DemoProvider";
import { localDateOf } from "../domain/time";
import { makeDraft, resolveRule } from "../domain/assistant";
import { SourceCard } from "../components/SourceCard";
import { copyTextToClipboard, downloadTextFile } from "../platform/download";

interface BarrierPageProps {
  planId: TemplateId;
  taskId: TaskId;
}

const REASONS: { id: BarrierReason; label: string }[] = [
  { id: "no_slots", label: "Нет записи" },
  { id: "unclear_process", label: "Не понимаю порядок" },
  { id: "no_response", label: "Нет ответа" },
];

export const BarrierPage: React.FC<BarrierPageProps> = ({ planId, taskId }) => {
  const { state, dispatch, isSaving } = useDemo();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const template = TEMPLATES[planId];
  if (!template) {
    return (
      <div className="page-content">
        <h1>Учебный план не найден</h1>
        <a href="#/" className="btn-primary">
          На главную
        </a>
      </div>
    );
  }

  const task = template.tasks.find((t) => t.id === taskId);
  if (!task) {
    return (
      <div className="page-content">
        <h1>Учебная задача не найдена</h1>
        <a href={`#/plan/${planId}`} className="btn-primary">
          К памятке
        </a>
      </div>
    );
  }

  if (task.kind === "info") {
    return (
      <div className="page-content">
        <div style={{ marginBottom: "16px" }}>
          <a href={`#/plan/${planId}/task/${taskId}`}>← Вернуться к задаче</a>
        </div>
        <div className="card">
          <h2 className="card-title">У этой учебной задачи нет организационных препятствий</h2>
          <p className="text-muted">
            Данный пункт является информационным шагом ознакомления и не предусматривает организационных препятствий.
          </p>
          <div style={{ marginTop: "16px" }}>
            <a href={`#/plan/${planId}/task/${taskId}`} className="btn-primary">
              Вернуться к задаче
            </a>
          </div>
        </div>
      </div>
    );
  }

  const plan = state.plans[planId];
  const taskState = plan?.tasks[taskId];
  const currentReason = taskState?.barrier?.reason ?? null;
  const isBarrierOpen = taskState?.barrier !== null && taskState?.barrier?.closedAt === null;

  const handleSelectReason = (reason: BarrierReason) => {
    dispatch({
      type: "REPORT_BARRIER",
      planId,
      taskId,
      reason,
      now: new Date().toISOString(),
    });
  };

  const handleOutcome = (outcome: "waiting" | "persists" | "resolved") => {
    dispatch({
      type: "RECORD_OUTCOME",
      planId,
      taskId,
      outcome,
      now: new Date().toISOString(),
    });
  };

  const today = localDateOf(new Date());
  const ruleResult = currentReason
    ? resolveRule(planId, taskId, currentReason, today)
    : null;

  const draft = currentReason ? makeDraft(template, task, currentReason) : "";

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(draft);
    if (ok) {
      setCopyStatus("Текст скопирован в буфер обмена");
      setTimeout(() => setCopyStatus(null), 3000);
    } else {
      setCopyStatus("Не удалось скопировать автоматически, выделите текст вручную");
    }
  };

  const handleDownload = () => {
    downloadTextFile(`zapros-${taskId}.txt`, draft);
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: "16px" }}>
        <a href={`#/plan/${planId}/task/${taskId}`}>← Вернуться к задаче</a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span className="badge">Помощь при препятствии</span>
        {taskState?.barrier && (
          <span className="badge" style={{ background: isBarrierOpen ? "#FFF3E0" : "#E8F5E9" }}>
            {isBarrierOpen ? "Препятствие в работе" : "Препятствие разрешено"}
          </span>
        )}
      </div>

      <h1 style={{ fontSize: "26px", margin: "12px 0 16px 0" }}>
        {task.order}. {task.title}
      </h1>

      <div className="card" style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "12px" }}>
          Что именно не получается? Выберите причину:
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {REASONS.map((r) => {
            const isSelected = currentReason === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={isSaving}
                onClick={() => handleSelectReason(r.id)}
                className={isSelected ? "btn-primary" : ""}
                style={{
                  minHeight: "44px",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {ruleResult && (
        <div className="card" style={{ marginBottom: "20px" }}>
          {ruleResult.kind === "available" && (
            <div>
              <h2 className="card-title" style={{ color: "var(--accent)", marginBottom: "12px" }}>
                {ruleResult.rule.title}
              </h2>
              <p style={{ fontSize: "18px", lineHeight: 1.6, marginBottom: "16px" }}>
                {ruleResult.rule.actionText}
              </p>
              <div
                style={{
                  background: "#F1F5F9",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "15px",
                  color: "var(--muted)",
                  marginBottom: "16px",
                }}
              >
                Ограничение: {ruleResult.rule.limitation}
              </div>

              <div style={{ marginTop: "20px" }}>
                <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>
                  Учебный черновик запроса (read-only):
                </h3>
                <textarea
                  readOnly
                  value={draft}
                  rows={6}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontFamily: "inherit",
                    fontSize: "16px",
                    lineHeight: 1.5,
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "#F8FAFC",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
                  <button type="button" onClick={handleCopy}>
                    Скопировать черновик
                  </button>
                  <button type="button" onClick={handleDownload}>
                    Скачать .txt
                  </button>
                </div>
                {copyStatus && (
                  <p style={{ color: "#2E7D32", marginTop: "8px", fontSize: "15px" }}>
                    {copyStatus}
                  </p>
                )}
              </div>

              <SourceCard source={ruleResult.source} />
            </div>
          )}

          {ruleResult.kind === "expired" && (
            <div>
              <div
                style={{
                  background: "#FFEBEE",
                  border: "1px solid #FFCDD2",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  color: "#C62828",
                  fontWeight: 500,
                  marginBottom: "16px",
                }}
              >
                Подсказка требует повторной проверки. Доступен только исходный текст учебной памятки.
              </div>
              <SourceCard source={ruleResult.source} />
            </div>
          )}

          {ruleResult.kind === "unavailable" && (
            <p className="text-muted">{ruleResult.message}</p>
          )}
        </div>
      )}

      {currentReason && isBarrierOpen && (
        <div className="card" style={{ marginBottom: "20px", background: "#F8FAFC" }}>
          <h2 style={{ fontSize: "18px", marginTop: 0, marginBottom: "12px" }}>
            Зафиксировать результат обращения:
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleOutcome("waiting")}
              style={{
                background: taskState?.status === "waiting" ? "#E0F2FE" : undefined,
                borderColor: taskState?.status === "waiting" ? "#0284C7" : undefined,
              }}
            >
              ⏳ Жду ответа
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleOutcome("persists")}
              style={{
                background: taskState?.status === "blocked" && taskState.barrier?.outcome === "persists" ? "#FEE2E2" : undefined,
                borderColor: taskState?.status === "blocked" && taskState.barrier?.outcome === "persists" ? "#DC2626" : undefined,
              }}
            >
              ⚠ Проблема сохраняется
            </button>
            <button
              type="button"
              disabled={isSaving}
              className="btn-primary"
              onClick={() => handleOutcome("resolved")}
            >
              ✓ Получилось
            </button>
          </div>
        </div>
      )}

      {currentReason && !isBarrierOpen && taskState?.barrier?.outcome === "resolved" && (
        <div
          className="card"
          style={{
            marginBottom: "20px",
            background: "#E8F5E9",
            borderColor: "#C8E6C9",
          }}
        >
          <strong style={{ color: "#2E7D32" }}>
            ✓ Препятствие отмечено решённым
          </strong>
          <p style={{ margin: "6px 0 12px 0", fontSize: "16px" }}>
            Организационный вопрос решён. Теперь вы можете вернуться к задаче и отметить её выполнение.
          </p>
          <a href={`#/plan/${planId}/task/${taskId}`} className="btn-primary">
            Вернуться к задаче
          </a>
        </div>
      )}
    </div>
  );
};
