import React, { useState, useRef } from "react";
import { useDemo } from "../app/DemoProvider";
import { SOURCES } from "../data/sources";
import { ConfirmDialog } from "../components/ConfirmDialog";

const MARKET_REFERENCES = [
  { id: "S1", title: "Медсенджер", desc: "Программы наблюдения после очного приёма, напоминания, опросники, дневники." },
  { id: "S2", title: "ЗдравКонтроль", desc: "Чаты и помощь с маршрутизацией, организационными сложностями и записью." },
  { id: "S3", title: "ONDOC", desc: "Личный кабинет пациента, сопровождение и напоминания." },
  { id: "S4–S6", title: "Epic MyChart Care Companion", desc: "Персонализированный план задач и сопровождение после приёма в зарубежных клиниках." },
  { id: "S7–S8", title: "MyTherapy / Medisafe", desc: "Приложения расписаний и напоминаний." },
  { id: "S9", title: "ВЦИОМ (2025)", desc: "Данные социологических исследований об ожидании записи и организационных барьерах." },
  { id: "S10", title: "AHRQ Health Literacy", desc: "Методология проверки понимания пациентом следующего шага (teach-back)." },
  { id: "S11", title: "MDN Web Docs", desc: "Спецификации Web Notifications API, Service Worker и offline-хранилища." },
  { id: "S12", title: "RFC 5545", desc: "Спецификация интернет-календаря iCalendar (.ics)." },
  { id: "S13", title: "Vite & React Ecosystem", desc: "Инструменты сборки статического веб-приложения." },
  { id: "S14", title: "152-ФЗ «О персональных данных»", desc: "Ст. 10: Специальные категории персональных данных о состоянии здоровья." },
  { id: "S15", title: "323-ФЗ «Об основах охраны здоровья граждан в РФ»", desc: "Ст. 13: Режим врачебной тайны и факт обращения за медицинской помощью." },
  { id: "S16", title: "Критерии Росздравнадзора", desc: "Нормативные ориентиры классификации медицинского программного обеспечения." },
];

export const AboutPage: React.FC = () => {
  const { reset, isSaving } = useDemo();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetConfirm = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await reset();
      if (!res.ok) {
        setResetError(res.message || "Не удалось сбросить данные");
      }
    } catch {
      setResetError("Ошибка при сбросе данных");
    } finally {
      setIsResetting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="page-content">
      <h1 style={{ fontSize: "28px", marginTop: 0, marginBottom: "16px" }}>О демонстрационном приложении</h1>

      <div
        style={{
          background: "#E8F1F5",
          border: "1px solid #B8CDD8",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "20px",
          fontWeight: 500,
        }}
      >
        Демонстрационное приложение разработано для хакатона на синтетических данных и не является медицинской консультацией или медицинским изделием.
      </div>

      <div className="card">
        <h2 className="card-title">Учебные сценарии и ограничения</h2>
        <p>
          Приложение «МАРШРУТ» создано исключительно в образовательных и демонстрационных целях. Все сценарии, тексты памяток и шаги являются синтетическими и вымышленными.
        </p>
        <p className="text-muted">
          Приложение не осуществляет медицинскую деятельность, не заменяет консультацию врача, не ставит диагнозы, не назначает лечение и не оценивает тяжесть состояния здоровья. При любых симптомах или ухудшении самочувствия немедленно обращайтесь к врачу или в экстренные службы.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Встроенное учебное содержание</h2>
        <p className="text-muted" style={{ marginBottom: "16px" }}>
          Учебные сценарии и правила, встроенные непосредственно в клиентскую часть приложения:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {Object.values(SOURCES).map((src) => (
            <div
              key={src.id}
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <strong>{src.title}</strong>
                <span className="badge" style={{ fontSize: "12px" }}>v{src.version}</span>
              </div>
              <p style={{ margin: "4px 0 8px 0", fontSize: "15px" }}>{src.body}</p>
              <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                <div>Область: {src.scope}</div>
                <div>Проверено: {src.checkedAt} | Срок пересмотра: {src.nextReviewAt}</div>
                <div style={{ marginTop: "4px", color: "#6D4C41", fontWeight: 500 }}>
                  Ограничение: {src.limitation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Материалы исследования рынка и нормативные ориентиры</h2>
        <p className="text-muted" style={{ marginBottom: "16px" }}>
          Справочные источники, анализировавшиеся при проектировании концепции и демонстрационной модели:
        </p>
        <ul style={{ paddingLeft: "20px", margin: 0 }}>
          {MARKET_REFERENCES.map((ref) => (
            <li key={ref.id} style={{ marginBottom: "10px", fontSize: "15px" }}>
              <strong>[{ref.id}] {ref.title}</strong> — {ref.desc}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 className="card-title">Границы приватности и хранение данных</h2>
        <p>
          В приложении соблюдаются строгие границы приватности:
        </p>
        <ul>
          <li>Реальные персональные данные и сведения о здоровье пациентов не запрашиваются, не обрабатываются и не сохраняются.</li>
          <li>В гостевом демо данные хранятся локально на вашем устройстве в браузере.</li>
          <li>В авторизованном аккаунте учебное состояние хранится на защищённом сервере и не записывается в постоянные хранилища браузера.</li>
          <li>Сброс состояния плана не удаляет аккаунт и не выполняет выход из системы; для выхода используйте отдельную кнопку выхода.</li>
          <li>Приложение не передаёт данные сторонним внешним сервисам.</li>
        </ul>
      </div>

      <div className="card">
        <h2 className="card-title">Автономный режим (Offline)</h2>
        <p>
          Приложение работает автономно. После первой загрузки основные экраны и памятки доступны даже при отсутствии подключения к сети Интернет.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Сброс состояния демонстрации</h2>
        <p className="text-muted" style={{ marginBottom: "16px" }}>
          Удаляет все локальные отметки, выбранные памятки и напоминания. Приложение вернётся к начальному состоянию.
        </p>

        {resetError && (
          <p style={{ color: "#D32F2F", marginBottom: "12px" }}>{resetError}</p>
        )}

        <button
          ref={triggerRef}
          type="button"
          disabled={isSaving || isResetting}
          onClick={() => setShowConfirm(true)}
          style={{ color: "#D32F2F", borderColor: "#D32F2F", minHeight: "44px" }}
        >
          {isResetting ? "Сброс..." : "Сбросить данные плана"}
        </button>

        <ConfirmDialog
          isOpen={showConfirm}
          title="Вы действительно хотите сбросить сохранённые данные?"
          message="Все локальные отметки, выбранные памятки и препятствия будут удалены из браузера."
          confirmLabel="Да, сбросить всё"
          cancelLabel="Отмена"
          onConfirm={handleResetConfirm}
          onCancel={() => setShowConfirm(false)}
          triggerRef={triggerRef}
        />
      </div>
    </div>
  );
};
