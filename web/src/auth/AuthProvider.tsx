import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PublicUser, SessionView } from "../domain/authTypes";
import {
  apiLogin,
  apiLogout,
  fetchSession,
  ApiClientError,
} from "../platform/api";

export type AuthState =
  | { status: "checking" }
  | { status: "guest" }
  | {
      status: "authenticated";
      user: PublicUser;
      expiresAt: string;
      csrfToken: string;
    }
  | {
      status: "locked";
      reason: "unavailable" | "expired" | "account-changed" | "logout-pending";
      candidateUser?: PublicUser;
    }
  | { status: "logging-out" };

export interface AuthContextValue {
  auth: AuthState;
  generation: number;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  recheck(): Promise<void>;
  acceptCurrentSession(expectedUserId: string): Promise<void>;
  enterGuestDemo(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const LOGOUT_PENDING_KEY = "marshrut.auth.logout-pending.v1";
export const SIGNAL_KEY = "marshrut.auth.signal.v1";
const BROADCAST_CHANNEL_NAME = "marshrut-auth-v1";

function broadcastChange(): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: "session-changed" });
      bc.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }

  try {
    localStorage.setItem(SIGNAL_KEY, String(Date.now()) + ":" + Math.random());
  } catch {
    // Ignore localStorage failures
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [generation, setGeneration] = useState(0);
  const currentAuthRef = useRef(auth);
  currentAuthRef.current = auth;

  const handleSessionResult = useCallback((session: SessionView): void => {
    if (!session.authenticated) {
      try {
        localStorage.removeItem(LOGOUT_PENDING_KEY);
      } catch {
        // Ignore
      }
      setAuth((prev) => {
        if (prev.status === "guest") return prev;
        setGeneration((g) => g + 1);
        return { status: "guest" };
      });
      return;
    }

    // Authenticated session received
    const isLogoutPending = (() => {
      try {
        return localStorage.getItem(LOGOUT_PENDING_KEY) === "1";
      } catch {
        return false;
      }
    })();

    if (isLogoutPending) {
      setAuth((prev) => {
        if (prev.status === "locked" && prev.reason === "logout-pending") return prev;
        setGeneration((g) => g + 1);
        return {
          status: "locked",
          reason: "logout-pending",
          candidateUser: session.user,
        };
      });
      return;
    }

    const current = currentAuthRef.current;
    if (current.status === "authenticated") {
      if (
        current.user.id !== session.user.id ||
        current.user.role !== session.user.role ||
        current.csrfToken !== session.csrfToken
      ) {
        setGeneration((g) => g + 1);
        setAuth({
          status: "locked",
          reason: "account-changed",
          candidateUser: session.user,
        });
        return;
      }
      // Same user, update expiresAt / csrfToken if needed without changing generation
      setAuth({
        status: "authenticated",
        user: session.user,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
      });
      return;
    }

    // Transitioning from checking or guest or locked to authenticated
    setGeneration((g) => g + 1);
    setAuth({
      status: "authenticated",
      user: session.user,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
    });
  }, []);

  const recheck = useCallback(async (): Promise<void> => {
    try {
      const session = await fetchSession();
      handleSessionResult(session);
    } catch {
      setAuth((prev) => {
        if (prev.status === "guest") return prev;
        const isLogoutPending = (() => {
          try {
            return localStorage.getItem(LOGOUT_PENDING_KEY) === "1";
          } catch {
            return false;
          }
        })();
        setGeneration((g) => g + 1);
        if (isLogoutPending) {
          const candidateUser =
            prev.status === "authenticated"
              ? prev.user
              : prev.status === "locked"
              ? prev.candidateUser
              : undefined;
          return { status: "locked", reason: "logout-pending", candidateUser };
        }
        return { status: "locked", reason: "unavailable" };
      });
    }
  }, [handleSessionResult]);

  // Initial bootstrap
  useEffect(() => {
    recheck();
  }, [recheck]);

  // Expiration timer
  useEffect(() => {
    if (auth.status !== "authenticated") return;

    const expiryTime = new Date(auth.expiresAt).getTime();
    const remainingMs = Math.max(0, expiryTime - Date.now());

    const timer = setTimeout(() => {
      setGeneration((g) => g + 1);
      setAuth({ status: "locked", reason: "expired" });
    }, remainingMs);

    return () => clearTimeout(timer);
  }, [auth]);

  // Periodic check (every 60s when visible)
  useEffect(() => {
    if (auth.status !== "authenticated") return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        recheck();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [auth.status, recheck]);

  // Listen to focus, pageshow, and visibilitychange
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        document.documentElement.removeAttribute("data-account-masked");
        if (currentAuthRef.current.status === "authenticated") {
          recheck();
        }
      } else {
        if (currentAuthRef.current.status === "authenticated") {
          document.documentElement.setAttribute("data-account-masked", "true");
        }
      }
    };

    const onPageShow = () => {
      document.documentElement.removeAttribute("data-account-masked");
      recheck();
    };

    const onPageHide = () => {
      if (currentAuthRef.current.status === "authenticated") {
        document.documentElement.setAttribute("data-account-masked", "true");
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onPageShow);

    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onPageShow);
    };
  }, [recheck]);

  // Cross-tab synchronization
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = (event) => {
          if (event.data && event.data.type === "session-changed") {
            recheck();
          }
        };
      }
    } catch {
      // Ignore
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === SIGNAL_KEY) {
        recheck();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [recheck]);

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      try {
        const session = await apiLogin(username, password);
        try {
          localStorage.removeItem(LOGOUT_PENDING_KEY);
        } catch {
          // Ignore
        }
        broadcastChange();
        handleSessionResult(session);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "ALREADY_AUTHENTICATED") {
          // Another active cookie exists
          try {
            const currentSession = await fetchSession();
            if (currentSession.authenticated) {
              setGeneration((g) => g + 1);
              setAuth({
                status: "locked",
                reason: "account-changed",
                candidateUser: currentSession.user,
              });
              return;
            }
          } catch {
            // Ignore
          }
        }
        throw err;
      }
    },
    [handleSessionResult]
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = currentAuthRef.current;
    try {
      localStorage.setItem(LOGOUT_PENDING_KEY, "1");
    } catch {
      // Ignore
    }

    setAuth({ status: "logging-out" });

    let userId: string | undefined;
    let csrfToken: string | undefined;
    if (current.status === "authenticated") {
      userId = current.user.id;
      csrfToken = current.csrfToken;
    } else if (current.status === "locked" && current.candidateUser) {
      userId = current.candidateUser.id;
    }

    if (!csrfToken) {
      try {
        const fresh = await fetchSession();
        if (fresh.authenticated) {
          userId = fresh.user.id;
          csrfToken = fresh.csrfToken;
        } else {
          try {
            localStorage.removeItem(LOGOUT_PENDING_KEY);
          } catch {
            // Ignore
          }
          broadcastChange();
          setGeneration((g) => g + 1);
          setAuth({ status: "guest" });
          return;
        }
      } catch (err) {
        broadcastChange();
        setGeneration((g) => g + 1);
        setAuth({
          status: "locked",
          reason: "logout-pending",
          candidateUser: current.status === "locked" ? current.candidateUser : undefined,
        });
        throw err;
      }
    }

    try {
      await apiLogout(userId, csrfToken);
      try {
        localStorage.removeItem(LOGOUT_PENDING_KEY);
      } catch {
        // Ignore
      }
      broadcastChange();
      setGeneration((g) => g + 1);
      setAuth({ status: "guest" });
    } catch (err) {
      broadcastChange();
      setGeneration((g) => g + 1);
      setAuth({
        status: "locked",
        reason: "logout-pending",
        candidateUser: userId ? { id: userId, username: "", role: "patient" } : undefined,
      });
      throw err;
    }
  }, []);

  const acceptCurrentSession = useCallback(
    async (expectedUserId: string): Promise<void> => {
      try {
        const session = await fetchSession();
        if (session.authenticated && session.user.id === expectedUserId) {
          try {
            localStorage.removeItem(LOGOUT_PENDING_KEY);
          } catch {
            // Ignore
          }
          broadcastChange();
          setGeneration((g) => g + 1);
          setAuth({
            status: "authenticated",
            user: session.user,
            expiresAt: session.expiresAt,
            csrfToken: session.csrfToken,
          });
        } else {
          handleSessionResult(session);
        }
      } catch {
        setGeneration((g) => g + 1);
        setAuth({ status: "locked", reason: "unavailable" });
      }
    },
    [handleSessionResult]
  );

  const enterGuestDemo = useCallback((): void => {
    setGeneration((g) => g + 1);
    setAuth({ status: "guest" });
    window.location.hash = "#/";
  }, []);

  return (
    <AuthContext.Provider
      value={{
        auth,
        generation,
        login,
        logout,
        recheck,
        acceptCurrentSession,
        enterGuestDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
