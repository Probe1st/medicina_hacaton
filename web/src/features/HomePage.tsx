import React from "react";
import { TEMPLATES } from "../data/templates";
import { useDemo } from "../app/DemoProvider";
import { useAuth } from "../auth/AuthProvider";
import { getProgress } from "../domain/selectors";

export const HomePage: React.FC = () => {
  const { state } = useDemo();
  const { auth } = useAuth();

  const profileLabel =
    auth.status === "authenticated"
      ? `${auth.user.username} (${auth.user.role === "staff" ? "Сотрудник" : "Учебный пациент"})`
      : "Гостевой режим (Пациент Тестов)";
  return (
    <div className="page-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "28px" }}>Выбор учебной памятки</h1>
        <div className="badge" aria-label="Профиль пользователя">
          {profileLabel}
        </div>
      </div>

      <p className="text-muted" style={{ marginBottom: "24px" }}>
        Это синтетические демонстрационные памятки. Они не содержат персональных данных реальных пациентов, не ставят диагнозы и не заменяют консультацию медицинского специалиста.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {Object.values(TEMPLATES).map((template) => {
          const plan = state.plans[template.id];
          const progress = plan ? getProgress(plan, template) : null;

          return (
            <div key={template.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                <h2 className="card-title">{template.title}</h2>
                {progress && (
                  <span className="badge">
                    Выполнено {progress.done} из {progress.total}
                  </span>
                )}
              </div>
              <p className="text-muted" style={{ margin: "8px 0 16px" }}>
                Учебный сценарий организационных шагов (4 действия). Без клинических назначений.
              </p>
              <a
                href={`#/plan/${template.id}`}
                className="btn-primary"
                style={{ alignSelf: "flex-start" }}
              >
                {plan ? "Продолжить" : "Открыть памятку"}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};
