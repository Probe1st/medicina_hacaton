import type {
  ActionRequest,
  ClientAction,
  IssueResponse,
  ResetRequest,
  SessionView,
  StateSnapshot,
} from "../domain/authTypes";

export class ApiClientError extends Error {
  public status: number;
  public code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiClientError(503, "NETWORK_ERROR", "Не удалось связаться с сервером");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiClientError(504, "TIMEOUT", "Превышено время ожидания ответа сервера");
    }
    throw new ApiClientError(503, "NETWORK_ERROR", "Не удалось связаться с сервером");
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiClientError(
      res.status,
      "PROTOCOL_ERROR",
      `Некорректный тип ответа сервера: ${contentType || "пустой"}`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiClientError(res.status, "PROTOCOL_ERROR", "Не удалось прочитать JSON сервера");
  }

  if (!res.ok) {
    const errObj = data as { error?: { code?: string; message?: string } };
    if (errObj && errObj.error && typeof errObj.error.code === "string") {
      throw new ApiClientError(
        res.status,
        errObj.error.code,
        errObj.error.message || "Ошибка сервера"
      );
    }
    throw new ApiClientError(res.status, "INTERNAL_ERROR", "Внутренняя ошибка сервера");
  }

  return data as T;
}

export async function fetchSession(): Promise<SessionView> {
  const res = await fetchWithTimeout("/api/auth/session");
  const data = await parseJsonResponse<SessionView>(res);

  if (!data || typeof data !== "object") {
    throw new ApiClientError(500, "PROTOCOL_ERROR", "Некорректный формат сессии");
  }

  if (data.authenticated === false) {
    return { authenticated: false };
  }

  if (
    data.authenticated === true &&
    data.user &&
    typeof data.user.id === "string" &&
    typeof data.user.username === "string" &&
    (data.user.role === "patient" || data.user.role === "staff") &&
    typeof data.expiresAt === "string" &&
    typeof data.csrfToken === "string"
  ) {
    return data;
  }

  throw new ApiClientError(500, "PROTOCOL_ERROR", "Некорректная структура активной сессии");
}

export async function apiLogin(username: string, password: string): Promise<SessionView> {
  const res = await fetchWithTimeout("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marshrut-request": "1",
      origin: window.location.origin,
    },
    body: JSON.stringify({ username, password }),
  });

  return parseJsonResponse<SessionView>(res);
}

export async function apiLogout(userId?: string, csrfToken?: string): Promise<void> {
  const headers: Record<string, string> = {
    "x-marshrut-request": "1",
    origin: window.location.origin,
  };
  if (userId) {
    headers["x-marshrut-account"] = userId;
  }
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  const res = await fetchWithTimeout("/api/auth/logout", {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    await parseJsonResponse(res); // Will throw structured ApiClientError
  }
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
  userId: string,
  csrfToken: string
): Promise<void> {
  const res = await fetchWithTimeout("/api/auth/password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marshrut-request": "1",
      "x-marshrut-account": userId,
      "x-csrf-token": csrfToken,
      origin: window.location.origin,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) {
    await parseJsonResponse(res);
  }
}

export async function fetchState(userId: string): Promise<StateSnapshot> {
  const res = await fetchWithTimeout("/api/me/state", {
    method: "GET",
    headers: {
      "x-marshrut-account": userId,
    },
  });

  return parseJsonResponse<StateSnapshot>(res);
}

export async function postAction(
  action: ClientAction,
  expectedVersion: number,
  timeZone: string,
  userId: string,
  csrfToken: string
): Promise<StateSnapshot> {
  const payload: ActionRequest = {
    action,
    expectedVersion,
    timeZone,
  };

  const res = await fetchWithTimeout("/api/me/actions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marshrut-request": "1",
      "x-marshrut-account": userId,
      "x-csrf-token": csrfToken,
      origin: window.location.origin,
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<StateSnapshot>(res);
}

export async function postReset(
  expectedVersion: number,
  userId: string,
  csrfToken: string
): Promise<StateSnapshot> {
  const payload: ResetRequest = {
    expectedVersion,
  };

  const res = await fetchWithTimeout("/api/me/reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marshrut-request": "1",
      "x-marshrut-account": userId,
      "x-csrf-token": csrfToken,
      origin: window.location.origin,
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<StateSnapshot>(res);
}

export async function postIssue(
  templateId: string,
  userId: string,
  csrfToken: string
): Promise<IssueResponse> {
  const res = await fetchWithTimeout("/api/issue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-marshrut-request": "1",
      "x-marshrut-account": userId,
      "x-csrf-token": csrfToken,
      origin: window.location.origin,
    },
    body: JSON.stringify({ templateId }),
  });

  return parseJsonResponse<IssueResponse>(res);
}
