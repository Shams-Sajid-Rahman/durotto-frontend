import { ApiError } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const ADMIN_TOKEN_KEY = "durotto_admin_token";
const ADMIN_USER_KEY = "durotto_admin_user";

// ── Token storage (separate from the regular user session) ──────────────────────

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(ADMIN_TOKEN_KEY) ??
    sessionStorage.getItem(ADMIN_TOKEN_KEY)
  );
}

// "Remember me" picks localStorage (persists across restarts) vs sessionStorage
// (cleared when the tab closes).
export function setAdminSession(token: string, user: AdminUser, remember = true) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(ADMIN_TOKEN_KEY, token);
  store.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  other.removeItem(ADMIN_TOKEN_KEY);
  other.removeItem(ADMIN_USER_KEY);
}

export function getAdminUser(): AdminUser | null {
  if (typeof window === "undefined") return null;
  const raw =
    localStorage.getItem(ADMIN_USER_KEY) ??
    sessionStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_USER_KEY);
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let body: { detail?: unknown; message?: unknown } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null; // non-JSON error page
  }
  if (!res.ok) {
    // Expired/revoked admin session (but not a failed login attempt).
    if (res.status === 401 && token && path !== "/admin/login") {
      clearAdminSession();
      if (typeof window !== "undefined") window.location.assign("/admin/login");
    }
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.message === "string"
          ? body.message
          : "Request failed";
    throw new ApiError(res.status, message);
  }
  return (body ?? undefined) as T;
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  bio?: string;
  avatarUrl?: string;
  status: "active" | "suspended";
  createdAt: string;
}

export interface AdminStats {
  users: number;
  admins: number;
  rooms: number;
  calls: number;
  loginAttempts: number;
  successfulLogins: number;
  failedLogins: number;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  email: string;
  ip: string;
  userAgent: string;
  success: boolean;
  at: string;
}

export interface CallHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  hostName: string;
  participantCount: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
}

export interface DatabaseDump {
  users: AdminUser[];
  rooms: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  counts: Record<string, number>;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: "user" | "admin";
  status?: "active" | "suspended";
  password?: string;
}

// ── API ─────────────────────────────────────────────────────────────────────────

export const adminApi = {
  login(email: string, password: string) {
    return adminRequest<{ access_token: string; token_type: string; user: AdminUser }>(
      "/admin/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
  },
  stats() {
    return adminRequest<AdminStats>("/admin/stats");
  },
  users() {
    return adminRequest<AdminUser[]>("/admin/users");
  },
  createUser(payload: CreateUserPayload) {
    return adminRequest<AdminUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateUser(id: string, payload: UpdateUserPayload) {
    return adminRequest<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteUser(id: string) {
    return adminRequest<{ message: string }>(`/admin/users/${id}`, {
      method: "DELETE",
    });
  },
  loginHistory() {
    return adminRequest<LoginHistoryEntry[]>("/admin/login-history");
  },
  calls() {
    return adminRequest<CallHistoryEntry[]>("/admin/calls");
  },
  database() {
    return adminRequest<DatabaseDump>("/admin/database");
  },
};
