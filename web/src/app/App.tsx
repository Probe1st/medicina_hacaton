import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import type { TaskId, TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { DemoProvider, useDemo } from "./DemoProvider";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { parseRoute, type Route } from "./hashRoute";
import { dueReminders } from "../domain/selectors";
import { localDateOf } from "../domain/time";
import { HomePage } from "../features/HomePage";
import { PlanPage } from "../features/PlanPage";
import { TaskPage } from "../features/TaskPage";
import { BarrierPage } from "../features/BarrierPage";
import { AboutPage } from "../features/AboutPage";
import { FaqPage } from "../features/FaqPage";
import { IssuePage } from "../features/IssuePage";
import { InsightsPage } from "../features/InsightsPage";
import { NotFoundPage } from "../features/NotFoundPage";
import { LoginPage } from "../features/LoginPage";
import { AccountPage } from "../features/AccountPage";
import { ForbiddenPage } from "../features/ForbiddenPage";
import { StatusMessage } from "../components/StatusMessage";

interface DueBanner {
  planId: TemplateId;
  taskId: TaskId;
  title: string;
}

interface PwaProps {
  needRefresh: boolean;
  offlineReady: boolean;
  setOfflineReady: (val: boolean) => void;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
}

const AppShell: React.FC<{ pwa: PwaProps }> = ({ pwa }) => {
  const { auth, logout } = useAuth();
  const { state, dispatch, storageWarning, dismissStorageWarning, isLoaded, isSaving } = useDemo();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [dueBanners, setDueBanners] = useState<DueBanner[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

  // Map of last attempt timestamps for reminder throttle: (planId:taskId:at) -> performance.now()
  const reminderAttemptsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const handleHash = () => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (state.events.length > 0) {
      const last = state.events[state.events.length - 1];
      if (last.kind === "task_completed") {
        setLiveAnnouncement("Действие отмечено выполненным");
      } else if (last.kind === "task_reopened") {
        setLiveAnnouncement("Отметка действия снята");
      } else if (last.kind === "barrier_reported") {
        setLiveAnnouncement("Препятствие зафиксировано");
      } else if (last.kind === "outcome_recorded") {
        setLiveAnnouncement("Результат препятствия сохранён");
      }
    }
  }, [state.events]);

  // Guarded single auto-open effect
  useEffect(() => {
    if (!isLoaded || isSaving) return;
    if (
      (route.page === "plan" ||
        route.page === "task" ||
        route.page === "barrier" ||
        route.page === "faq") &&
      route.planId
    ) {
      if (!state.plans[route.planId]) {
        const now = new Date();
        dispatch({
          type: "OPEN_PLAN",
          planId: route.planId,
          now: now.toISOString(),
          localDate: localDateOf(now),
        });
      }
    }
  }, [isLoaded, isSaving, route, state.plans, dispatch]);

  const checkReminders = useCallback(() => {
    if (!isLoaded) return;
    const nowIso = new Date().toISOString();
    const due = dueReminders(state, nowIso);
    if (due.length === 0) return;

    const isAccount = auth.status === "authenticated";
    const nowPerf = performance.now();
    const newBanners: DueBanner[] = [];

    for (const item of due) {
      const plan = state.plans[item.planId];
      const taskState = plan?.tasks[item.taskId];
      const reminderAt = taskState?.reminder?.at;
      if (!reminderAt) continue;

      const template = TEMPLATES[item.planId];
      const taskDef = template?.tasks.find((t) => t.id === item.taskId);

      if (isAccount) {
        // Only show banner if server has actually confirmed firedAt!
        if (taskState?.reminder?.firedAt) {
          newBanners.push({
            planId: item.planId,
            taskId: item.taskId,
            title: taskDef?.title ?? "Задача",
          });
        }

        // Throttle FIRE_REMINDER: at most once every 15 seconds per reminder
        const throttleKey = `${item.planId}:${item.taskId}:${reminderAt}`;
        const lastAttempt = reminderAttemptsRef.current[throttleKey] || 0;
        if (nowPerf - lastAttempt >= 15_000 && !taskState?.reminder?.firedAt) {
          reminderAttemptsRef.current[throttleKey] = nowPerf;
          dispatch({
            type: "FIRE_REMINDER",
            planId: item.planId,
            taskId: item.taskId,
            now: nowIso,
          });
        }
      } else {
        // Guest mode: instant local dispatch and banner display
        newBanners.push({
          planId: item.planId,
          taskId: item.taskId,
          title: taskDef?.title ?? "Задача",
        });

        dispatch({
          type: "FIRE_REMINDER",
          planId: item.planId,
          taskId: item.taskId,
          now: nowIso,
        });
      }
    }

    if (newBanners.length > 0) {
      setDueBanners((prev) => {
        const existing = new Set(prev.map((b) => `${b.planId}:${b.taskId}`));
        const additions = newBanners.filter((b) => !existing.has(`${b.planId}:${b.taskId}`));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }
  }, [isLoaded, state, auth.status, dispatch]);

  useEffect(() => {
    setDueBanners((prev) =>
      prev.filter((b) => {
        const plan = state.plans[b.planId];
        const task = plan?.tasks[b.taskId];
        return task && task.status !== "done" && task.reminder !== null;
      })
    );
  }, [state.plans]);

  useEffect(() => {
    checkReminders();

    const handleFocus = () => checkReminders();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkReminders();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = setInterval(checkReminders, 15_000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [checkReminders]);

  const dismissDueBanner = (planId: TemplateId, taskId: TaskId) => {
    setDueBanners((prev) => prev.filter((b) => !(b.planId === planId && b.taskId === taskId)));
  };

  const renderContent = () => {
    switch (route.page) {
      case "home":
        return <HomePage />;
      case "login":
        return <LoginPage />;
      case "account":
        return <AccountPage />;
      case "plan":
        return <PlanPage planId={route.planId} />;
      case "task":
        return <TaskPage planId={route.planId} taskId={route.taskId} />;
      case "barrier":
        return <BarrierPage planId={route.planId} taskId={route.taskId} />;
      case "about":
        return <AboutPage />;
      case "faq":
        return <FaqPage planId={route.planId} />;
      case "issue": {
        if (auth.status === "guest") {
          return (
            <LoginPage note="Выдача памятки доступна сотрудникам учебного стенда. Войдите в аккаунт сотрудника." />
          );
        }
        if (auth.status === "authenticated" && auth.user.role === "patient") {
          return (
            <ForbiddenPage
              title="Нет доступа"
              message="Выдача памятки доступна только сотрудникам учебного стенда."
            />
          );
        }
        return <IssuePage />;
      }
      case "insights": {
        if (auth.status === "guest") {
          return (
            <LoginPage note="Журнал и карта препятствий доступны в учебном аккаунте. Войдите в аккаунт." />
          );
        }
        return <InsightsPage />;
      }
      case "notFound":
      default:
        return <NotFoundPage />;
    }
  };

  return (
    <div className="app-shell">
      <StatusMessage message={liveAnnouncement} />

      <div className="top-banner" role="banner">
        Учебное демо. Только вымышленные данные. Не медицинская консультация
      </div>

      {pwa.needRefresh && (
        <div
          style={{
            background: "#E8F5E9",
            color: "#1B5E20",
            padding: "10px 16px",
            borderBottom: "1px solid #C8E6C9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          role="status"
        >
          <span>Доступна новая версия учебного приложения.</span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => pwa.updateServiceWorker(true)}
            style={{ minHeight: "36px", padding: "4px 12px", fontSize: "14px" }}
          >
            Обновить
          </button>
        </div>
      )}

      {pwa.offlineReady && !pwa.needRefresh && (
        <div
          style={{
            background: "#F0FDF4",
            color: "#166534",
            padding: "8px 16px",
            borderBottom: "1px solid #BBF7D0",
            fontSize: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          role="status"
        >
          <span>Демо доступно без сети на этом устройстве.</span>
          <button
            type="button"
            onClick={() => pwa.setOfflineReady(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#166534",
              cursor: "pointer",
              fontSize: "16px",
              padding: "2px 6px",
            }}
            aria-label="Закрыть уведомление"
          >
            ✕
          </button>
        </div>
      )}

      {storageWarning && (
        <div
          style={{
            background: "#FFF3E0",
            color: "#E65100",
            padding: "10px 16px",
            borderBottom: "1px solid #FFE0B2",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          role="status"
        >
          <span>{storageWarning}</span>
          <button
            type="button"
            onClick={dismissStorageWarning}
            style={{
              background: "transparent",
              border: "none",
              color: "#E65100",
              cursor: "pointer",
              fontSize: "18px",
              minHeight: "36px",
              minWidth: "36px",
              padding: "4px 8px",
            }}
            aria-label="Закрыть предупреждение"
          >
            ✕
          </button>
        </div>
      )}

      {dueBanners.map((b) => (
        <div
          key={`${b.planId}:${b.taskId}`}
          style={{
            background: "#E0F2FE",
            color: "#0369A1",
            padding: "10px 16px",
            borderBottom: "1px solid #BAE6FD",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <strong>Пора вернуться к плану:</strong>
            <span>{b.title}</span>
            <a
              href={`#/plan/${b.planId}/task/${b.taskId}`}
              style={{
                color: "#0284C7",
                fontWeight: 600,
                textDecoration: "underline",
                minHeight: "36px",
              }}
            >
              Перейти к действию →
            </a>
          </div>
          <button
            type="button"
            onClick={() => dismissDueBanner(b.planId, b.taskId)}
            style={{
              background: "transparent",
              border: "none",
              color: "#0369A1",
              cursor: "pointer",
              fontSize: "16px",
              padding: "4px 8px",
              minHeight: "36px",
              minWidth: "36px",
            }}
            aria-label="Закрыть напоминание"
          >
            ✕ Закрыть
          </button>
        </div>
      ))}

      <div className="app-container">
        <header className="header-nav">
          <a href="#/" className="nav-brand">
            МАРШРУТ
          </a>
          <nav className="nav-links" aria-label="Основная навигация">
            <a href="#/" className={route.page === "home" ? "active" : ""}>
              Мой план
            </a>
            <a href="#/about" className={route.page === "about" ? "active" : ""}>
              О демо
            </a>
            <a
              href="#/issue"
              className={`nav-secondary ${route.page === "issue" ? "active" : ""}`}
            >
              Выдать памятку
            </a>
            <a
              href="#/insights"
              className={`nav-secondary ${route.page === "insights" ? "active" : ""}`}
            >
              Карта препятствий
            </a>

            {auth.status === "authenticated" ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "8px" }}>
                <a
                  href="#/account"
                  className={route.page === "account" ? "active" : ""}
                  style={{ fontSize: "14px", textDecoration: "none" }}
                >
                  {auth.user.username} ({auth.user.role === "staff" ? "Сотрудник" : "Пациент"})
                </a>
                <button
                  type="button"
                  onClick={() => {
                    logout().catch(() => {});
                    window.location.hash = "#/login";
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "4px 6px",
                  }}
                >
                  Выйти
                </button>
              </div>
            ) : (
              <a
                href="#/login"
                className="btn-secondary"
                style={{
                  padding: "4px 10px",
                  fontSize: "14px",
                  textDecoration: "none",
                  marginLeft: "8px",
                }}
              >
                Войти
              </a>
            )}
          </nav>
        </header>

        <main id="main-content">{renderContent()}</main>
      </div>
    </div>
  );
};

const AuthGate: React.FC<{ pwa: PwaProps }> = ({ pwa }) => {
  const { auth, generation, recheck, logout, acceptCurrentSession, enterGuestDemo } = useAuth();

  if (auth.status === "checking") {
    return (
      <div className="container" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <p className="text-muted" style={{ fontSize: "16px" }}>
          Проверка сессии...
        </p>
      </div>
    );
  }

  if (auth.status === "logging-out") {
    return (
      <div className="container" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <p className="text-muted" style={{ fontSize: "16px" }}>
          Завершение сеанса...
        </p>
      </div>
    );
  }

  if (auth.status === "locked") {
    const { reason, candidateUser } = auth;

    return (
      <div className="container" style={{ maxWidth: 520, margin: "40px auto", padding: "16px" }}>
        <div className="card" style={{ padding: "24px" }}>
          {reason === "unavailable" && (
            <>
              <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px", color: "var(--error)" }}>
                Связь с сервером недоступна
              </h2>
              <p style={{ color: "var(--muted)", marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                Не удалось проверить сеанс. Подключитесь к серверу или откройте отдельное учебное демо.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => recheck()}
                  style={{ padding: "10px 16px" }}
                >
                  Повторить проверку
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={enterGuestDemo}
                  style={{ padding: "10px 16px" }}
                >
                  Открыть учебное демо
                </button>
              </div>
            </>
          )}

          {reason === "expired" && (
            <>
              <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px" }}>
                Сеанс завершён
              </h2>
              <p style={{ color: "var(--muted)", marginBottom: "20px", fontSize: "15px" }}>
                Срок действия вашей сессии истёк. Войдите заново для продолжения.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    window.location.hash = "#/login";
                  }}
                  style={{ padding: "10px 16px" }}
                >
                  Войти
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={enterGuestDemo}
                  style={{ padding: "10px 16px" }}
                >
                  Открыть учебное демо
                </button>
              </div>
            </>
          )}

          {reason === "account-changed" && (
            <>
              <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px" }}>
                Сеанс в этом браузере изменился
              </h2>
              <p style={{ color: "var(--muted)", marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                Обнаружен активный сеанс пользователя:{" "}
                <strong>{candidateUser?.username || "неизвестно"}</strong>
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {candidateUser && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => acceptCurrentSession(candidateUser.id)}
                    style={{ padding: "10px 16px" }}
                  >
                    Перейти в аккаунт {candidateUser.username}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => logout().catch(() => {})}
                  style={{ padding: "10px 16px" }}
                >
                  Выйти из текущего аккаунта
                </button>
                <button
                  type="button"
                  onClick={enterGuestDemo}
                  style={{ padding: "10px 16px" }}
                >
                  Открыть учебное демо
                </button>
              </div>
            </>
          )}

          {reason === "logout-pending" && (
            <>
              <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px", color: "var(--warning)" }}>
                Выход не подтверждён сервером
              </h2>
              <p style={{ color: "var(--muted)", marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                Экран аккаунта закрыт. Серверный выход не подтверждён. Подключитесь и повторите выход.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => logout().catch(() => {})}
                  style={{ padding: "10px 16px" }}
                >
                  Повторить выход
                </button>
                {candidateUser && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => acceptCurrentSession(candidateUser.id)}
                    style={{ padding: "10px 16px" }}
                  >
                    Отменить прежний выход и перейти в текущий аккаунт
                  </button>
                )}
                <button
                  type="button"
                  onClick={enterGuestDemo}
                  style={{ padding: "10px 16px" }}
                >
                  Открыть учебное демо
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // guest or authenticated
  return (
    <DemoProvider key={`${auth.status}-${generation}`}>
      <AppShell pwa={pwa} />
    </DemoProvider>
  );
};

export const App: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onOfflineReady() {
      setOfflineReady(true);
    },
  });

  return (
    <AuthProvider>
      <AuthGate
        pwa={{
          needRefresh,
          offlineReady,
          setOfflineReady,
          updateServiceWorker,
        }}
      />
    </AuthProvider>
  );
};

export default App;
