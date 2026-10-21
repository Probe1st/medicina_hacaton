
export function ForbiddenPage({
  title = "Нет доступа",
  message = "У вашей учётной записи недостаточно прав для выполнения этой операции.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="container" style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px" }}>
      <div className="card" style={{ padding: "24px", textAlign: "center" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px", color: "var(--error)" }}>
          {title}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "20px", lineHeight: "1.5" }}>
          {message}
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "#/";
          }}
          className="btn btn-primary"
          style={{ padding: "8px 16px" }}
        >
          Вернуться на главную
        </button>
      </div>
    </div>
  );
}
