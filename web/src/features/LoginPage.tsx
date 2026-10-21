import React, { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ApiClientError } from "../platform/api";

export function LoginPage({ note }: { note?: string }) {
  const { auth, login, enterGuestDemo } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (auth.status === "authenticated") {
    window.location.hash = "#/account";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setErrorMessage("Введите логин");
      return;
    }
    if (!password) {
      setErrorMessage("Введите пароль");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedUser, password);
      setPassword("");
      window.location.hash = "#/";
    } catch (err) {
      setPassword("");
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Не удалось войти. Проверьте подключение к серверу");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
      <div className="card" style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "8px" }}>
          Вход в учебный аккаунт
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
          Учётную запись выдаёт оператор. Не используйте медицинские данные.
        </p>

        {note && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "var(--surface)",
              borderRadius: "6px",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {note}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: "12px",
              backgroundColor: "rgba(220, 38, 38, 0.1)",
              border: "1px solid var(--error)",
              borderRadius: "6px",
              color: "var(--error)",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="login-username"
              style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}
            >
              Учебный логин
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              className="input"
              style={{ width: "100%", padding: "8px 12px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="login-password"
              style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}
            >
              Пароль
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="input"
              style={{ width: "100%", padding: "8px 12px", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ width: "100%", padding: "10px", fontWeight: "bold" }}
          >
            {isSubmitting ? "Проверка..." : "Войти"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <button
            type="button"
            onClick={enterGuestDemo}
            className="btn btn-secondary"
            style={{ fontSize: "14px" }}
          >
            Открыть учебное демо
          </button>
        </div>
      </div>
    </div>
  );
}
