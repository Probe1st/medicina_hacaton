import React from "react";
import type { ContentSource } from "../domain/types";

interface SourceCardProps {
  source: ContentSource;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  return (
    <div
      className="card"
      style={{
        background: "#F8FAFC",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "16px",
        fontSize: "15px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <strong style={{ fontSize: "16px", color: "var(--accent)" }}>
          {source.title} (v{source.version})
        </strong>
        <span className="badge" style={{ fontSize: "13px" }}>
          Учебное правило, не официальный порядок получения помощи
        </span>
      </div>

      <div style={{ color: "var(--muted)", margin: "8px 0" }}>
        <div>Область применения: {source.scope}</div>
        <div>
          Проверено: {source.checkedAt} | Срок пересмотра: {source.nextReviewAt}
        </div>
        <div>Роль: {source.reviewerRole}</div>
      </div>

      <div
        style={{
          background: "#FFF8E1",
          border: "1px solid #FFE082",
          color: "#795548",
          padding: "8px 12px",
          borderRadius: "6px",
          marginTop: "10px",
          fontWeight: 500,
        }}
      >
        Ограничение: {source.limitation}
      </div>
    </div>
  );
};
