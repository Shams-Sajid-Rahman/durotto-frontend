"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  auth as authApi,
  setAuthToken,
  setUnauthorizedHandler,
  type AuthResponse,
  type LoginPayload,
  type RegisterPayload,
} from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";

export interface User {
  id: string;
  name: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload, remember?: boolean) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "durotto_token";
const USER_KEY = "durotto_user";

// ── Session store (browser storage is the source of truth) ─────────────────────
// "Remember me" chooses localStorage (persists across browser restarts) vs
// sessionStorage (cleared when the tab closes).

interface AuthSnapshot {
  user: User | null;
  token: string | null;
}

const EMPTY: AuthSnapshot = { user: null, token: null };
const listeners = new Set<() => void>();
let cachedKey: string | null = null;
let cachedSnapshot: AuthSnapshot = EMPTY;

function storageWithToken(): Storage | null {
  try {
    if (localStorage.getItem(TOKEN_KEY)) return localStorage;
    if (sessionStorage.getItem(TOKEN_KEY)) return sessionStorage;
  } catch {
    // storage unavailable (privacy mode)
  }
  return null;
}

function getSnapshot(): AuthSnapshot {
  const store = storageWithToken();
  const token = store?.getItem(TOKEN_KEY) ?? null;
  const userRaw = store?.getItem(USER_KEY) ?? null;
  const key = token && userRaw ? `${token}\u0000${userRaw}` : "";
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = EMPTY;
    if (token && userRaw) {
      try {
        cachedSnapshot = { token, user: JSON.parse(userRaw) as User };
      } catch {
        // corrupt entry → treat as signed out
      }
    }
    // Keep the API client in sync before any child effect issues a request.
    setAuthToken(cachedSnapshot.token);
  }
  return cachedSnapshot;
}

function getServerSnapshot(): AuthSnapshot {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === TOKEN_KEY || event.key === USER_KEY) listener();
  };
  window.addEventListener("storage", onStorage); // sign-in/out in other tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persistAuth(res: AuthResponse, remember: boolean) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
  store.setItem(TOKEN_KEY, res.access_token);
  store.setItem(USER_KEY, JSON.stringify(res.user));
  emit();
}

function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
  emit();
}

// ── Provider ────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // An expired or revoked token surfaces as a 401 → sign out locally.
  useEffect(() => {
    setUnauthorizedHandler(clearAuth);
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (payload: LoginPayload, remember = true) => {
    const res = await authApi.login(payload);
    persistAuth(res, remember);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await authApi.register(payload);
    persistAuth(res, true);
  }, []);

  const logout = useCallback(() => clearAuth(), []);

  const updateUser = useCallback((updates: Partial<User>) => {
    const store = storageWithToken();
    const current = getSnapshot().user;
    if (!store || !current) return;
    try {
      store.setItem(USER_KEY, JSON.stringify({ ...current, ...updates }));
    } catch {
      // Quota exceeded (e.g. a large avatar) — keep the old cached profile.
    }
    emit();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: snapshot.user,
      token: snapshot.token,
      isLoading: !hydrated,
      login,
      register,
      logout,
      updateUser,
      isAuthenticated: !!snapshot.token && !!snapshot.user,
    }),
    [snapshot, hydrated, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
