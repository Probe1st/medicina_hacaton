import type { Action, DemoState } from "./types";

export type UserRole = "patient" | "staff";

export interface PublicUser {
  id: string; // UUID, not real name
  username: string;
  role: UserRole;
}

export type SessionView =
  | { authenticated: false }
  | { authenticated: true; user: PublicUser; expiresAt: string; csrfToken: string };

export interface StateSnapshot {
  state: DemoState;
  version: number;
}

export type ClientAction = Action extends infer A
  ? A extends Action ? Omit<A, "now" | "localDate"> : never : never;

export interface ActionRequest {
  action: ClientAction;
  expectedVersion: number;
  timeZone: string;
}

export interface ResetRequest {
  expectedVersion: number;
}

export interface IssueRequest {
  templateId: string;
}

export interface IssueResponse {
  templateId: string;
  hash: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
