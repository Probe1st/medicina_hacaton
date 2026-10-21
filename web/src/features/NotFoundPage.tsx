import React from "react";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="page-content">
      <h1 style={{ fontSize: "28px", marginTop: 0, marginBottom: "16px" }}>Страница не найдена</h1>
      <p className="text-muted" style={{ marginBottom: "24px" }}>
        Запрошенный раздел или действие отсутствует в демонстрационной версии приложения.
      </p>
      <a href="#/" className="btn-primary">
        Вернуться к выбору памятки
      </a>
    </div>
  );
};
