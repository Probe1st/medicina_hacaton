import React, { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiChangePassword, ApiClientError } from "../platform/api";

export function AccountPage() {
  const { auth, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (auth.status !== "authenticated") {
    window.location.hash = "#/login";
    return null;
  }

  const roleLabel =
    auth.user.role === "staff" ? "Сотрудник учебного стенда" : "Учебный пользователь";

  const formattedExpiry = new Date(auth.expiresAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Введите текущий пароль");
      return;
    }

    if ([...newPassword].length < 15 || [...newPassword].length > 128) {
      setPasswordError("Новый пароль должен содержать от 15 до 128 символов");
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiChangePassword(
        currentPassword,
        newPassword,
        auth.user.id,
        auth.csrfToken
      );
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess("Пароль успешно изменён. Пожалуйста, выполните вход заново");
      setTimeout(() => {
        logout().catch(() => {});
        window.location.hash = "#/login";
      }, 1500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPasswordError(err.message);
      } else {
        setPasswordError("Ошибка при смене пароля. Попробуйте позже");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.hash = "#/login";
    } catch {
      // AuthProvider handles lock state on network failure
    }
  };

  return (
    <div className="container" style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px" }}>
      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "16px" }}>
          Учебная учётная запись
        </h1>

        <div style={{ display: "grid", gap: "12px", marginBottom: "20px", fontSize: "14px" }}>
          <div>
            <span style={{ color: "var(--muted)" }}>Учебный логин: </span>
            <strong>{auth.user.username}</strong>
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>Роль: </span>
            <strong>{roleLabel}</strong>
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>Сеанс активен до: </span>
            <strong>{formattedExpiry}</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ width: "100%", padding: "8px 12px" }}
        >
          Выйти из аккаунта
        </button>
      </div>

      <div className="card" style={{ padding: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
          Смена пароля
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "16px" }}>
          После смены пароля потребуется войти заново. Состояние плана сохраняется.
        </p>

        {passwordError && (
          <div
            role="alert"
            style={{
              padding: "10px",
              backgroundColor: "rgba(220, 38, 38, 0.1)",
              border: "1px solid var(--error)",
              borderRadius: "6px",
              color: "var(--error)",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div
            role="status"
            style={{
              padding: "10px",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              border: "1px solid var(--success)",
              borderRadius: "6px",
              color: "var(--success)",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {passwordSuccess}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="current-password"
              style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}
            >
              Текущий пароль
            </label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isChangingPassword}
              className="input"
              style={{ width: "100%", padding: "8px 12px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="new-password"
              style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}
            >
              Новый пароль (от 15 символов)
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isChangingPassword}
              className="input"
              style={{ width: "100%", padding: "8px 12px", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={isChangingPassword}
            className="btn btn-primary"
            style={{ width: "100%", padding: "10px" }}
          >
            {isChangingPassword ? "Сохранение..." : "Сменить пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
