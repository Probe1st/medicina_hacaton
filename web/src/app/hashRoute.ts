import type { TemplateId, TaskId } from "../domain/types";
import { TEMPLATES } from "../data/templates";

export type Route =
  | { page: "home" }
  | { page: "login" }
  | { page: "account" }
  | { page: "plan"; planId: TemplateId }
  | { page: "task" | "barrier"; planId: TemplateId; taskId: TaskId }
  | { page: "faq"; planId: TemplateId }
  | { page: "issue" | "insights" | "about" | "notFound" };

export function parseRoute(hash: string): Route {
  let raw = hash.startsWith("#") ? hash.slice(1) : hash;

  if (raw.includes("?")) {
    return { page: "notFound" };
  }

  let decoded = "";
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { page: "notFound" };
  }

  const trimmed = decoded.replace(/^\/+/, "").replace(/\/+$/, "");

  if (trimmed === "" || trimmed === "/") {
    return { page: "home" };
  }
  if (trimmed === "login") {
    return { page: "login" };
  }
  if (trimmed === "account") {
    return { page: "account" };
  }
  if (trimmed === "issue") {
    return { page: "issue" };
  }
  if (trimmed === "insights") {
    return { page: "insights" };
  }
  if (trimmed === "about") {
    return { page: "about" };
  }

  const segments = trimmed.split("/");
  if (segments.some((s) => s === "")) {
    return { page: "notFound" };
  }

  const rawPlanId = segments[1];
  if (rawPlanId !== "orvi-demo" && rawPlanId !== "vaccine-demo") {
    return { page: "notFound" };
  }
  const planId: TemplateId = rawPlanId;
  const template = TEMPLATES[planId];

  if (segments.length === 2 && segments[0] === "plan") {
    return template ? { page: "plan", planId } : { page: "notFound" };
  }

  if (segments.length === 3 && segments[0] === "plan" && segments[2] === "faq") {
    return template ? { page: "faq", planId } : { page: "notFound" };
  }

  if (segments.length === 4 && segments[0] === "plan" && segments[2] === "task") {
    const taskId = segments[3] as TaskId;
    if (template && template.tasks.some((t) => t.id === taskId)) {
      return { page: "task", planId, taskId };
    }
    return { page: "notFound" };
  }

  if (
    segments.length === 5 &&
    segments[0] === "plan" &&
    segments[2] === "task" &&
    segments[4] === "barrier"
  ) {
    const taskId = segments[3] as TaskId;
    if (template && template.tasks.some((t) => t.id === taskId)) {
      return { page: "barrier", planId, taskId };
    }
    return { page: "notFound" };
  }

  return { page: "notFound" };
}
