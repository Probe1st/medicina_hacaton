import React, { useState } from "react";
import type { EventKind, TemplateId } from "../domain/types";
import { useDemo } from "../app/DemoProvider";
import { getInsights } from "../domain/selectors";
import { TEMPLATES } from "../data/templates";

const EVENT_KIND_LABELS: Record<EventKind, string> = {
  plan_opened: "Открыта памятка",
  task_completed: "Выполнено действие",
  task_reopened: "Снята отметка выполнения",
  barrier_reported: "Зафиксировано препятствие",
  outcome_recorded: "Отмечен результат препятствия",
  quiz_answered: "Проверка понимания",
};

export const InsightsPage: React.FC = () => {
  const { state } = useDemo();
  const [filterId, setFilterId] = useState<TemplateId | "all">("all");

  const insights = getInsights(state, filterId === "all" ? undefined : filterId);

  const isEmpty = insights.plansOpened === 0 && insights.events.length === 0;

  const maxReasonCount = Math.max(
    1,
    insights.reasonsCurrent.no_slots,
    insights.reasonsCurrent.unclear_process,
    insights.reasonsCurrent.no_response
  );

  const formatEventTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: "16px" }}>
        <a href="#/">← Вернуться к моим планам</a>
      </div>

      <h1 style={{ fontSize: "28px", margin: "0 0 8px 0" }}>Карта препятствий</h1>
      <p className="text-muted" style={{ margin: "0 0 20px 0", fontSize: "16px" }}>
        Учебные данные этого аккаунта. Это действия с учебными сценариями, не медицинская статистика.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
        <button
          type="button"
          className={filterId === "all" ? "btn-primary" : ""}
          onClick={() => setFilterId("all")}
          style={{ minHeight: "44px" }}
        >
          Все памятки
        </button>
        <button
          type="button"
          className={filterId === "orvi-demo" ? "btn-primary" : ""}
          onClick={() => setFilterId("orvi-demo")}
          style={{ minHeight: "44px" }}
        >
          После ОРВИ
        </button>
        <button
          type="button"
          className={filterId === "vaccine-demo" ? "btn-primary" : ""}
          onClick={() => setFilterId("vaccine-demo")}
          style={{ minHeight: "44px" }}
        >
          После прививки
        </button>
      </div>

      {isEmpty ? (
        <div className="card">
          <p className="text-muted" style={{ margin: 0, fontSize: "18px" }}>
            Пока нет отмеченных препятствий.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div className="card" style={{ padding: "16px", margin: 0 }}>
              <div className="text-muted" style={{ fontSize: "14px", marginBottom: "4px" }}>
                Планов открыто
              </div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "var(--accent)" }}>
                {insights.plansOpened}
              </div>
            </div>

            <div className="card" style={{ padding: "16px", margin: 0 }}>
              <div className="text-muted" style={{ fontSize: "14px", marginBottom: "4px" }}>
                Задач выполнено
              </div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "var(--accent)" }}>
                {insights.tasksDone} из {insights.tasksTotal}
              </div>
            </div>

            <div className="card" style={{ padding: "16px", margin: 0 }}>
              <div className="text-muted" style={{ fontSize: "14px", marginBottom: "4px" }}>
                Текущих препятствий
              </div>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: insights.barriersCurrent > 0 ? "#E65100" : "var(--accent)" }}>
                {insights.barriersCurrent}
              </div>
            </div>

            <div className="card" style={{ padding: "16px", margin: 0 }}>
              <div className="text-muted" style={{ fontSize: "14px", marginBottom: "4px" }}>
                Проверка понимания (1-я попытка)
              </div>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--accent)", marginTop: "4px" }}>
                {insights.quizFirstAnswered === 0
                  ? "0 из 0 отвечено"
                  : `${insights.quizFirstCorrect} из ${insights.quizFirstAnswered} верно (${Math.round((insights.quizFirstCorrect / insights.quizFirstAnswered) * 100)}%)`}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "16px" }}>
              Распределение текущих препятствий по причинам
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Нет записи</span>
                  <strong>{insights.reasonsCurrent.no_slots}</strong>
                </div>
                <div style={{ background: "#ECEFF1", borderRadius: "4px", height: "12px", overflow: "hidden" }}>
                  <div
                    style={{
                      background: "var(--accent)",
                      height: "100%",
                      width: `${(insights.reasonsCurrent.no_slots / maxReasonCount) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Не понимаю порядок</span>
                  <strong>{insights.reasonsCurrent.unclear_process}</strong>
                </div>
                <div style={{ background: "#ECEFF1", borderRadius: "4px", height: "12px", overflow: "hidden" }}>
                  <div
                    style={{
                      background: "var(--accent)",
                      height: "100%",
                      width: `${(insights.reasonsCurrent.unclear_process / maxReasonCount) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>Нет ответа</span>
                  <strong>{insights.reasonsCurrent.no_response}</strong>
                </div>
                <div style={{ background: "#ECEFF1", borderRadius: "4px", height: "12px", overflow: "hidden" }}>
                  <div
                    style={{
                      background: "var(--accent)",
                      height: "100%",
                      width: `${(insights.reasonsCurrent.no_response / maxReasonCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "16px" }}>
              Последние зафиксированные исходы
            </h2>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: "150px", padding: "12px", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: "8px" }}>
                <div style={{ color: "#0369A1", fontSize: "14px" }}>⏳ Ждут ответа</div>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#0284C7" }}>
                  {insights.outcomesLatest.waiting}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: "150px", padding: "12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px" }}>
                <div style={{ color: "#B91C1C", fontSize: "14px" }}>⚠ Проблема сохраняется</div>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#DC2626" }}>
                  {insights.outcomesLatest.persists}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: "150px", padding: "12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px" }}>
                <div style={{ color: "#15803D", fontSize: "14px" }}>✓ Удалось решить</div>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#16A34A" }}>
                  {insights.outcomesLatest.resolved}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "16px" }}>
              Журнал локальных действий (последние {insights.events.length})
            </h2>

            {insights.events.length === 0 ? (
              <p className="text-muted">Событий пока нет.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {insights.events.slice().reverse().map((ev) => {
                  const tmpl = TEMPLATES[ev.planId];
                  const taskDef = ev.taskId ? tmpl?.tasks.find((t) => t.id === ev.taskId) : null;

                  return (
                    <li
                      key={ev.id}
                      style={{
                        padding: "10px 0",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        fontSize: "15px",
                      }}
                    >
                      <div>
                        <strong>{EVENT_KIND_LABELS[ev.kind] ?? ev.kind}</strong>
                        <div style={{ color: "var(--muted)", fontSize: "14px" }}>
                          {tmpl?.title}
                          {taskDef ? ` • ${taskDef.title}` : ""}
                        </div>
                      </div>
                      <span className="badge" style={{ fontSize: "12px" }}>
                        {formatEventTime(ev.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
