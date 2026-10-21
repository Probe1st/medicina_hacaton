import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Action, DemoState, TextMode } from "../domain/types";
import type { ClientAction } from "../domain/authTypes";
import { INITIAL_STATE, reduceDemo } from "../domain/reducer";
import { loadDemo, resetDemo, saveDemo, STORAGE_KEY } from "../platform/storage";
import { useAuth } from "../auth/AuthProvider";
import { fetchState, postAction, postReset, ApiClientError } from "../platform/api";

export interface DemoContextValue {
  state: DemoState;
  dispatch: (action: Action) => void;
  reset: () => Promise<{ ok: boolean; message?: string }>;
  textMode: TextMode;
  setTextMode: (mode: TextMode) => void;
  storageWarning: string | null;
  dismissStorageWarning: () => void;
  isMemoryOnly: boolean;
  isLoaded: boolean;
  isSaving: boolean;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export const useDemo = (): DemoContextValue => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return context;
};

function toClientAction(action: Action): ClientAction {
  switch (action.type) {
    case "OPEN_PLAN":
      return { type: "OPEN_PLAN", planId: action.planId };
    case "SET_TEXT_MODE":
      return { type: "SET_TEXT_MODE", mode: action.mode };
    case "COMPLETE_TASK":
      return { type: "COMPLETE_TASK", planId: action.planId, taskId: action.taskId };
    case "REOPEN_TASK":
      return { type: "REOPEN_TASK", planId: action.planId, taskId: action.taskId };
    case "REPORT_BARRIER":
      return { type: "REPORT_BARRIER", planId: action.planId, taskId: action.taskId, reason: action.reason };
    case "RECORD_OUTCOME":
      return { type: "RECORD_OUTCOME", planId: action.planId, taskId: action.taskId, outcome: action.outcome };
    case "SET_REMINDER":
      return { type: "SET_REMINDER", planId: action.planId, taskId: action.taskId, at: action.at };
    case "CANCEL_REMINDER":
      return { type: "CANCEL_REMINDER", planId: action.planId, taskId: action.taskId };
    case "FIRE_REMINDER":
      return { type: "FIRE_REMINDER", planId: action.planId, taskId: action.taskId };
    case "ANSWER_QUIZ":
      return { type: "ANSWER_QUIZ", planId: action.planId, answer: action.answer };
  }
}

export const DemoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, generation, recheck } = useAuth();

  const [state, setState] = useState<DemoState>(INITIAL_STATE);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isMemoryOnly, setIsMemoryOnly] = useState<boolean>(false);

  const isMemoryOnlyRef = useRef<boolean>(false);
  useEffect(() => {
    isMemoryOnlyRef.current = isMemoryOnly;
  }, [isMemoryOnly]);

  const versionRef = useRef<number>(0);
  const queueRef = useRef<ClientAction[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const generationRef = useRef<number>(generation);
  generationRef.current = generation;

  // Track initial load per auth mode / generation
  useEffect(() => {
    setIsLoaded(false);
    setIsSaving(false);
    queueRef.current = [];
    isProcessingQueueRef.current = false;

    if (auth.status === "guest") {
      const loadRes = loadDemo(window.localStorage);
      if (loadRes.kind === "ok") {
        setState(loadRes.state);
        setIsMemoryOnly(false);
      } else if (loadRes.kind === "empty") {
        setState(INITIAL_STATE);
        saveDemo(window.localStorage, INITIAL_STATE);
        setIsMemoryOnly(false);
      } else if (loadRes.kind === "invalid") {
        setState(INITIAL_STATE);
        setIsMemoryOnly(true);
        setStorageWarning(
          "Сохранённое учебное состояние повреждено или имеет неподдерживаемую версию. Можно продолжить без сохранения или сбросить демо."
        );
      } else if (loadRes.kind === "unavailable") {
        setState(INITIAL_STATE);
        setIsMemoryOnly(true);
        setStorageWarning("Изменения сохраняются только до закрытия страницы.");
      }
      setIsLoaded(true);
    } else if (auth.status === "authenticated") {
      const capturedGen = generation;
      fetchState(auth.user.id)
        .then((snapshot) => {
          if (generationRef.current !== capturedGen) return;
          versionRef.current = snapshot.version;
          setState(snapshot.state);
          setIsMemoryOnly(false);
          setIsLoaded(true);
        })
        .catch((err) => {
          if (generationRef.current !== capturedGen) return;
          if (err instanceof ApiClientError && (err.status === 401 || err.code === "ACCOUNT_CHANGED")) {
            recheck();
          } else {
            setStorageWarning(err instanceof Error ? err.message : "Не удалось загрузить состояние");
          }
        });
    }
  }, [auth.status, generation, recheck]);

  // Guest storage listener
  useEffect(() => {
    if (auth.status !== "guest") return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === null) {
        setState(INITIAL_STATE);
        return;
      }
      const loadRes = loadDemo(window.localStorage);
      if (loadRes.kind === "ok") {
        setState(loadRes.state);
        setStorageWarning("Учебное состояние изменено в другой вкладке.");
      } else if (loadRes.kind === "invalid") {
        setIsMemoryOnly(true);
        setStorageWarning(
          "Сохранённое учебное состояние повреждено или имеет неподдерживаемую версию. Можно продолжить без сохранения или сбросить демо."
        );
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [auth.status]);

  // Process server queue FIFO
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    if (auth.status !== "authenticated") return;

    isProcessingQueueRef.current = true;
    setIsSaving(true);

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    try {
      while (queueRef.current.length > 0) {
        const nextAction = queueRef.current.shift()!;
        const capturedGen = generationRef.current;

        try {
          const snapshot = await postAction(
            nextAction,
            versionRef.current,
            timeZone,
            auth.user.id,
            auth.csrfToken
          );

          if (generationRef.current !== capturedGen) {
            queueRef.current = [];
            break;
          }

          versionRef.current = snapshot.version;
          setState(snapshot.state);
        } catch (err) {
          queueRef.current = [];
          if (err instanceof ApiClientError) {
            if (err.status === 409 && err.code === "STATE_CONFLICT") {
              setStorageWarning(
                "План изменился в другой вкладке. Проверьте состояние и повторите действие"
              );
              // Refetch fresh snapshot
              try {
                const fresh = await fetchState(auth.user.id);
                if (generationRef.current === capturedGen) {
                  versionRef.current = fresh.version;
                  setState(fresh.state);
                }
              } catch {
                // Ignore
              }
            } else if (err.status === 401 || err.code === "ACCOUNT_CHANGED") {
              recheck();
            } else {
              setStorageWarning(err.message);
            }
          } else {
            setStorageWarning("Сетевая ошибка при сохранении действия на сервере");
          }
          break;
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
      setIsSaving(queueRef.current.length > 0);
    }
  }, [auth, recheck]);

  const dispatch = useCallback(
    (action: Action) => {
      if (auth.status === "guest") {
        setState((prevState) => {
          const nextState = reduceDemo(prevState, action);
          if (nextState !== prevState) {
            if (!isMemoryOnlyRef.current) {
              const res = saveDemo(window.localStorage, nextState);
              if (!res.ok) {
                setIsMemoryOnly(true);
                setStorageWarning("Изменения сохраняются только до закрытия страницы.");
              }
            }
          }
          return nextState;
        });
      } else if (auth.status === "authenticated") {
        const clientAction = toClientAction(action);
        queueRef.current.push(clientAction);
        processQueue();
      }
    },
    [auth.status, processQueue]
  );

  const reset = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (auth.status === "guest") {
      const res = resetDemo(window.localStorage);
      if (!res.ok) {
        return { ok: false, message: "Сохранённое состояние удалить не удалось." };
      }
      setState(INITIAL_STATE);
      setIsMemoryOnly(false);
      setStorageWarning(null);
      window.location.hash = "#/";
      return { ok: true };
    }

    if (auth.status === "authenticated") {
      try {
        setIsSaving(true);
        const snapshot = await postReset(versionRef.current, auth.user.id, auth.csrfToken);
        versionRef.current = snapshot.version;
        setState(snapshot.state);
        setIsMemoryOnly(false);
        setStorageWarning(null);
        window.location.hash = "#/";
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Не удалось сбросить план на сервере";
        setStorageWarning(msg);
        return { ok: false, message: msg };
      } finally {
        setIsSaving(false);
      }
    }

    return { ok: false, message: "Сброс недоступен в текущем состоянии" };
  }, [auth]);

  const setTextMode = useCallback(
    (mode: TextMode) => {
      dispatch({ type: "SET_TEXT_MODE", mode });
    },
    [dispatch]
  );

  const dismissStorageWarning = useCallback(() => {
    setStorageWarning(null);
  }, []);

  return (
    <DemoContext.Provider
      value={{
        state,
        dispatch,
        reset,
        textMode: state.textMode,
        setTextMode,
        storageWarning,
        dismissStorageWarning,
        isMemoryOnly,
        isLoaded,
        isSaving,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
};
