import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserPublic } from "@moneytalks/types";
import { apiClient, type LoginInput, type RegisterInput } from "../lib/api/index.js";
import { sessionStore } from "../lib/session.js";
import { newClientId } from "../lib/constants.js";
import { openDB, clearAll } from "@moneytalks/offline";

interface AuthContextValue {
  user: UserPublic | null;
  status: "loading" | "ready";
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(() => sessionStore.load().user);
  const [status, setStatus] = useState<"loading" | "ready">("ready");
  const hydrated = useRef(false);

  const hydrate = useCallback(async () => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      await openDB();
    } catch {
      // IndexedDB unavailable; continue without offline store.
    }
    if (!sessionStore.load().accessToken) {
      setStatus("ready");
      return;
    }
    if (!sessionStore.load().deviceId) {
      sessionStore.setDeviceId(newClientId());
    }
    try {
      const { user: u } = await apiClient.auth.me();
      setUser(u);
    } catch {
      sessionStore.clear();
      setUser(null);
    } finally {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const login = useCallback(async (input: LoginInput) => {
    const res = await apiClient.auth.login(input);
    sessionStore.setTokens(res.accessToken, res.refreshToken);
    sessionStore.setDeviceId(res.deviceId);
    sessionStore.setUser(res.user);
    setUser(res.user);
    setStatus("ready");
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await apiClient.auth.register(input);
  }, []);

  const clearSession = useCallback(async () => {
    await clearAll().catch(() => undefined);
    sessionStore.clear();
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    const deviceId = sessionStore.load().deviceId;
    try {
      if (deviceId) await apiClient.auth.logout(deviceId);
    } catch {
      // Best-effort: still clear the local session.
    }
    await clearSession();
  }, [clearSession]);

  const logoutAll = useCallback(async () => {
    try {
      await apiClient.auth.logoutAll();
    } catch {
      // best-effort
    }
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const { user: u } = await apiClient.auth.me();
    setUser(u);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, logoutAll, refreshUser }),
    [user, status, login, register, logout, logoutAll, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
