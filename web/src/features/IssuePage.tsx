import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import type { TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { copyTextToClipboard } from "../platform/download";
import { useAuth } from "../auth/AuthProvider";
import { postIssue, ApiClientError } from "../platform/api";

export const IssuePage: React.FC = () => {
  const { auth } = useAuth();
  const [selectedId, setSelectedId] = useState<TemplateId>("orvi-demo");
  const [issuedHash, setIssuedHash] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const template = TEMPLATES[selectedId];

  const shareLink = typeof window !== "undefined" && issuedHash
    ? `${window.location.origin}${window.location.pathname}${issuedHash}`
    : "";

  useEffect(() => {
    let active = true;
    if (!shareLink) {
      setQrUrl("");
      return;
    }

    QRCode.toDataURL(shareLink, { width: 220, margin: 2 })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl("");
      });

    return () => {
      active = false;
    };
  }, [shareLink]);

  const handleSelectTemplate = (id: TemplateId) => {
    setSelectedId(id);
    setIssuedHash(null);
    setQrUrl("");
    setIssueError(null);
    setCopyStatus(null);
  };

  const handleGenerate = async () => {
    if (auth.status !== "authenticated") return;
    setIsIssuing(true);
    setIssueError(null);

    try {
      const res = await postIssue(selectedId, auth.user.id, auth.csrfToken);
      setIssuedHash(res.hash);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setIssueError(err.message);
      } else {
        setIssueError("Не удалось сформировать памятку. Попробуйте позже");
      }
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    const ok = await copyTextToClipboard(shareLink);
    if (ok) {
      setCopyStatus("Ссылка скопирована в буфер обмена");
      setTimeout(() => setCopyStatus(null), 3000);
    } else {
      setCopyStatus("Не удалось скопировать, выделите ссылку вручную");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isLocalhost = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return (
    <div className="page-content">
      <div className="no-print" style={{ marginBottom: "16px" }}>
        <a href="#/">← Вернуться к моим планам</a>
      </div>

      <div className="no-print">
        <h1 style={{ fontSize: "28px", margin: "0 0 8px 0" }}>Выдать памятку</h1>
        <p className="text-muted" style={{ margin: "0 0 20px 0", fontSize: "16px" }}>
          Сформируйте учебную ссылку или QR-код для пациента.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
          <button
            type="button"
            className={selectedId === "orvi-demo" ? "btn-primary" : ""}
            onClick={() => handleSelectTemplate("orvi-demo")}
            style={{ minHeight: "44px" }}
          >
            После ОРВИ
          </button>
          <button
            type="button"
            className={selectedId === "vaccine-demo" ? "btn-primary" : ""}
            onClick={() => handleSelectTemplate("vaccine-demo")}
            style={{ minHeight: "44px" }}
          >
            После вакцинации
          </button>
        </div>

        {!issuedHash && (
          <div style={{ marginBottom: "20px" }}>
            <button
              type="button"
              className="btn-primary"
              disabled={isIssuing}
              onClick={handleGenerate}
              style={{ minHeight: "44px", padding: "8px 20px" }}
            >
              {isIssuing ? "Формирование..." : "Сформировать памятку"}
            </button>
          </div>
        )}

        {issueError && (
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
            {issueError}
          </div>
        )}
      </div>

      {issuedHash && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "12px" }}>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>{template.title}</h2>
              <p className="text-muted" style={{ margin: "4px 0 0 0", fontSize: "15px" }}>
                Версия: {template.version} | Учебный демонстрационный сценарий
              </p>
            </div>
            <button
              type="button"
              className="btn-primary no-print"
              onClick={handlePrint}
              style={{ minHeight: "40px", padding: "8px 16px" }}
            >
              Распечатать памятку
            </button>
          </div>

          <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 16px 0" }}>
            Без лечения и клинических рекомендаций: только учебные организационные действия.
          </p>

          <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>Учебные действия плана:</h3>
          <ol style={{ paddingLeft: "20px", margin: "0 0 20px 0" }}>
            {template.tasks.map((t) => (
              <li key={t.id} style={{ marginBottom: "8px" }}>
                <strong>{t.title}</strong>
                <div style={{ fontSize: "15px", color: "var(--muted)" }}>{t.simpleText}</div>
              </li>
            ))}
          </ol>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "20px",
              marginTop: "16px",
              display: "flex",
              flexWrap: "wrap",
              gap: "24px",
              alignItems: "center",
            }}
          >
            {qrUrl && (
              <div style={{ textAlign: "center" }}>
                <img
                  src={qrUrl}
                  alt="QR-код для открытия памятки"
                  style={{ width: "200px", height: "200px", display: "block" }}
                />
                <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                  Сканируйте для открытия
                </span>
              </div>
            )}

            <div style={{ flex: 1, minWidth: "260px" }}>
              <label htmlFor="share-link-input" style={{ display: "block", fontSize: "15px", fontWeight: 600, marginBottom: "6px" }}>
                Ссылка для пациента:
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <input
                  id="share-link-input"
                  type="text"
                  readOnly
                  value={shareLink}
                  style={{
                    flex: 1,
                    minWidth: "200px",
                    fontSize: "15px",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "#F8FAFC",
                    minHeight: "44px",
                  }}
                />
                <button
                  type="button"
                  className="no-print"
                  onClick={handleCopyLink}
                  style={{ minHeight: "44px" }}
                >
                  Скопировать
                </button>
              </div>

              {copyStatus && (
                <p style={{ fontSize: "14px", color: "var(--accent)", margin: "4px 0" }}>
                  {copyStatus}
                </p>
              )}

              {isLocalhost && (
                <p className="no-print" style={{ fontSize: "13px", color: "var(--warning)", margin: "8px 0 0 0" }}>
                  ⚠ Внимание: на localhost QR-код откроется только на этом же устройстве.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
