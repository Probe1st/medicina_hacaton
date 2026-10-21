import React, { useState } from "react";
import type { FaqId, TemplateId } from "../domain/types";
import { TEMPLATES } from "../data/templates";
import { SOURCES } from "../data/sources";
import { useDemo } from "../app/DemoProvider";
import { answerFaq, FAQ_ITEMS } from "../domain/assistant";
import { SourceCard } from "../components/SourceCard";

interface FaqPageProps {
  planId: TemplateId;
}

export const FaqPage: React.FC<FaqPageProps> = ({ planId }) => {
  const { state, dispatch, isSaving } = useDemo();
  const [selectedFaq, setSelectedFaq] = useState<FaqId | "none" | null>("today");

  const template = TEMPLATES[planId];
  if (!template) {
    return (
      <div className="page-content">
        <h1>Учебная памятка не найдена</h1>
        <a href="#/" className="btn-primary">
          Вернуться на главную
        </a>
      </div>
    );
  }

  const plan = state.plans[planId];
  const currentQuizAnswer = plan?.quizCurrent ?? null;

  const handleSelectAnswer = (answer: "correct" | "incorrect") => {
    dispatch({
      type: "ANSWER_QUIZ",
      planId,
      answer,
      now: new Date().toISOString(),
    });
  };

  const currentAnswer =
    selectedFaq && selectedFaq !== "none" ? answerFaq(planId, selectedFaq) : null;

  return (
    <div className="page-content">
      <div style={{ marginBottom: "16px" }}>
        <a href={`#/plan/${planId}`}>← Вернуться к памятке</a>
      </div>

      <h1 style={{ fontSize: "28px", margin: "0 0 8px 0" }}>Ответы по памятке</h1>
      <p className="text-muted" style={{ margin: "0 0 24px 0", fontSize: "16px" }}>
        Строго в рамках заранее заданных правил. Не заменяет врача.
      </p>

      <div className="card" style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "16px" }}>
          Часто задаваемые вопросы:
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FAQ_ITEMS.map((item) => {
            const isSelected = selectedFaq === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedFaq(isSelected ? null : item.id)}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: isSelected ? "#F0F7F9" : "var(--surface)",
                  color: "var(--text)",
                  fontWeight: isSelected ? 600 : 400,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <span>{item.question}</span>
                <span style={{ fontSize: "18px", color: "var(--accent)" }}>
                  {isSelected ? "−" : "+"}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedFaq(selectedFaq === "none" ? null : "none")}
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: "8px",
              border: selectedFaq === "none" ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: selectedFaq === "none" ? "#F0F7F9" : "var(--surface)",
              color: "var(--muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <span>Моего вопроса нет в списке</span>
            <span style={{ fontSize: "18px", color: "var(--accent)" }}>
              {selectedFaq === "none" ? "−" : "+"}
            </span>
          </button>
        </div>

        {currentAnswer && (
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px solid var(--border)",
            }}
          >
            <h3 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px", color: "var(--accent)" }}>
              Ответ по памятке:
            </h3>
            <p style={{ fontSize: "17px", lineHeight: 1.6, margin: "0 0 16px 0" }}>
              {currentAnswer.text}
            </p>
            <SourceCard source={SOURCES[currentAnswer.sourceId]} />
          </div>
        )}

        {selectedFaq === "none" && (
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: "#FFF8E1",
              borderRadius: "8px",
              border: "1px solid #FFE082",
            }}
          >
            <h3 style={{ fontSize: "18px", marginTop: 0, marginBottom: "8px", color: "#795548" }}>
              Если вопроса нет в правилах:
            </h3>
            <p style={{ fontSize: "17px", lineHeight: 1.6, margin: "0 0 16px 0", color: "#3E2723" }}>
              В этой учебной памятке нет ответа. Уточните вопрос у выдавшего памятку специалиста. Приложение не определяет диагноз и не меняет назначения.
            </p>
            <SourceCard source={SOURCES["demo-help-v1"]} />
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", marginTop: 0, marginBottom: "8px" }}>
          Проверка понимания следующего шага
        </h2>
        <p className="text-muted" style={{ margin: "0 0 16px 0", fontSize: "16px" }}>
          Небольшое упражнение для закрепления роли учебной памятки. Не влияет на оценки и лечение.
        </p>

        <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>
          {template.quiz.question}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSelectAnswer("correct")}
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: "8px",
              border:
                currentQuizAnswer === "correct"
                  ? "2px solid #2E7D32"
                  : "1px solid var(--border)",
              background: currentQuizAnswer === "correct" ? "#E8F5E9" : "var(--surface)",
              color: "var(--text)",
              fontWeight: currentQuizAnswer === "correct" ? 600 : 400,
            }}
          >
            {template.quiz.correct}
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSelectAnswer("incorrect")}
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: "8px",
              border:
                currentQuizAnswer === "incorrect"
                  ? "2px solid #D32F2F"
                  : "1px solid var(--border)",
              background: currentQuizAnswer === "incorrect" ? "#FFEBEE" : "var(--surface)",
              color: "var(--text)",
              fontWeight: currentQuizAnswer === "incorrect" ? 600 : 400,
            }}
          >
            {template.quiz.incorrect}
          </button>
        </div>

        {currentQuizAnswer === "correct" && (
          <div
            style={{
              background: "#E8F5E9",
              border: "1px solid #C8E6C9",
              padding: "12px 16px",
              borderRadius: "8px",
              color: "#1B5E20",
              fontWeight: 500,
            }}
          >
            ✓ Да. Здесь отмечаются организационные действия, а не состояние здоровья.
          </div>
        )}

        {currentQuizAnswer === "incorrect" && (
          <div
            style={{
              background: "#FFF3E0",
              border: "1px solid #FFE0B2",
              padding: "12px 16px",
              borderRadius: "8px",
              color: "#E65100",
              fontWeight: 500,
            }}
          >
            ⚠ Эта памятка не меняет назначения и не оценивает здоровье. Доступны только учебные организационные шаги.
          </div>
        )}
      </div>
    </div>
  );
};
