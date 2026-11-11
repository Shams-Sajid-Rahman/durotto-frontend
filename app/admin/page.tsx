"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users as UsersIcon,
  History,
  Phone,
  Database as DatabaseIcon,
  LogOut,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  UserCog,
  Ban,
  CheckCircle2,
} from "lucide-react";
import {
  adminApi,
  getAdminToken,
  getAdminUser,
  clearAdminSession,
  type AdminUser,
  type AdminStats,
  type LoginHistoryEntry,
  type CallHistoryEntry,
  type DatabaseDump,
  type CreateUserPayload,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

type Tab = "overview" | "users" | "logins" | "calls" | "database";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "logins", label: "Login History", icon: History },
  { key: "calls", label: "Call History", icon: Phone },
  { key: "database", label: "Database", icon: DatabaseIcon },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Overview ────────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      className="bg-surface border border-border-subtle p-5"
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <p className="text-3xl font-semibold" style={{ color: accent ?? "var(--color-text-primary)" }}>
        {value}
      </p>
      <p className="text-sm text-text-secondary mt-1">{label}</p>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.stats().then(setStats).catch((e) =>
      setError(e instanceof ApiError ? e.message : "Failed to load stats."),
    );
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!stats) return <p className="text-sm text-text-tertiary">Loading…</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <StatTile label="Total users" value={stats.users} accent="#7C5CFF" />
      <StatTile label="Admins" value={stats.admins} />
      <StatTile label="Rooms created" value={stats.rooms} accent="#2ECFB1" />
      <StatTile label="Calls" value={stats.calls} />
      <StatTile label="Login attempts" value={stats.loginAttempts} />
      <StatTile label="Successful logins" value={stats.successfulLogins} accent="#22C55E" />
      <StatTile label="Failed logins" value={stats.failedLogins} accent="#FF6B6B" />
    </div>
  );
}

// ── User form modal ─────────────────────────────────────────────────────────────

function UserFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">(initial?.role ?? "user");
  const [status, setStatus] = useState<"active" | "suspended">(initial?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && initial) {
        await adminApi.updateUser(initial.id, {
          name,
          email,
          role,
          status,
          ...(password ? { password } : {}),
        });
      } else {
        const payload: CreateUserPayload = { name, email, password, role };
        await adminApi.createUser(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface-elevated border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-start/60 rounded-[var(--radius-md)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-border-subtle p-6"
        style={{ borderRadius: "var(--radius-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {isEdit ? "Edit user" : "Add user"}
        </h3>
        {error && (
          <div className="mb-4 px-3 py-2 bg-danger/10 border border-danger/30 text-danger text-sm rounded-[var(--radius-md)]">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {isEdit ? "New password (leave blank to keep)" : "Password"}
            </label>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••••" : "At least 8 characters"}
              required={!isEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Role</label>
              <select
                className={inputCls}
                value={role}
                onChange={(e) => setRole(e.target.value as "user" | "admin")}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Status</label>
                <select
                  className={inputCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "suspended")}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface-elevated border border-border-subtle rounded-[var(--radius-md)] hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-accent-gradient rounded-[var(--radius-md)] disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: "user" | "admin" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border",
        role === "admin"
          ? "border-accent-start/40 text-accent-start bg-accent-start/10"
          : "border-border-subtle text-text-secondary bg-surface-elevated",
      )}
    >
      {role === "admin" && <ShieldCheck className="w-3 h-3" />}
      {role}
    </span>
  );
}

function UsersTab({ currentAdminId }: { currentAdminId: string | null }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    adminApi
      .users()
      .then((list) => {
        if (!active) return;
        setUsers(list);
        setError(null);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : "Failed to load users.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function handleDelete(u: AdminUser) {
    if (!window.confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to delete user.");
    }
  }

  async function toggleStatus(u: AdminUser) {
    try {
      await adminApi.updateUser(u.id, {
        status: u.status === "active" ? "suspended" : "active",
      });
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to update user.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-accent-gradient rounded-[var(--radius-md)] hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add user
        </button>
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <div className="overflow-x-auto bg-surface border border-border-subtle rounded-[var(--radius-lg)]">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-tertiary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">No users.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 text-text-primary font-medium">
                    {u.name}
                    {u.id === currentAdminId && (
                      <span className="ml-2 text-[10px] text-text-tertiary">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium", u.status === "active" ? "text-success" : "text-danger")}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => { setEditing(u); setShowForm(true); }}
                        className="p-1.5 text-text-secondary hover:text-accent-start rounded-md hover:bg-surface-elevated"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title={u.status === "active" ? "Suspend" : "Activate"}
                        onClick={() => toggleStatus(u)}
                        className="p-1.5 text-text-secondary hover:text-warning rounded-md hover:bg-surface-elevated"
                      >
                        {u.status === "active" ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        disabled={u.id === currentAdminId}
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-text-secondary hover:text-danger rounded-md hover:bg-surface-elevated disabled:opacity-30 disabled:hover:text-text-secondary"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <UserFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Login history tab ───────────────────────────────────────────────────────────

function LoginsTab() {
  const [rows, setRows] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .loginHistory()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="overflow-x-auto bg-surface border border-border-subtle rounded-[var(--radius-lg)]">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-tertiary">
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">IP</th>
            <th className="px-4 py-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">No login attempts yet.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 text-text-tertiary whitespace-nowrap">{fmtDate(r.at)}</td>
                <td className="px-4 py-3 text-text-secondary">{r.email}</td>
                <td className="px-4 py-3 text-text-primary">{r.userName ?? "—"}</td>
                <td className="px-4 py-3 text-text-tertiary font-mono text-xs">{r.ip}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs font-medium", r.success ? "text-success" : "text-danger")}>
                    {r.success ? "success" : "failed"}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Call history tab ────────────────────────────────────────────────────────────

function CallsTab() {
  const [rows, setRows] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .calls()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load calls."))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="overflow-x-auto bg-surface border border-border-subtle rounded-[var(--radius-lg)]">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-tertiary">
            <th className="px-4 py-3 font-medium">Room</th>
            <th className="px-4 py-3 font-medium">Host</th>
            <th className="px-4 py-3 font-medium">Participants</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">No calls yet.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 text-text-primary font-medium">{r.roomName}</td>
                <td className="px-4 py-3 text-text-secondary">{r.hostName}</td>
                <td className="px-4 py-3 text-text-secondary">{r.participantCount}</td>
                <td className="px-4 py-3 text-text-tertiary whitespace-nowrap">{fmtDate(r.startedAt)}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs font-medium", r.endedAt ? "text-text-tertiary" : "text-success")}>
                    {r.endedAt ? "ended" : "active"}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Database tab ────────────────────────────────────────────────────────────────

function DatabaseTab() {
  const [dump, setDump] = useState<DatabaseDump | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.database().then(setDump).catch((e) =>
      setError(e instanceof ApiError ? e.message : "Failed to load database."),
    );
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!dump) return <p className="text-sm text-text-tertiary">Loading…</p>;

  const tables: { name: string; rows: unknown[] }[] = [
    { name: "users", rows: dump.users },
    { name: "rooms", rows: dump.rooms },
    { name: "sessions", rows: dump.sessions },
    { name: "calls", rows: dump.calls },
    { name: "notifications", rows: dump.notifications },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {Object.entries(dump.counts).map(([k, v]) => (
          <div key={k} className="px-4 py-2 bg-surface border border-border-subtle rounded-[var(--radius-md)]">
            <span className="text-text-primary font-semibold">{v}</span>{" "}
            <span className="text-text-tertiary text-xs">{k}</span>
          </div>
        ))}
      </div>

      {tables.map((t) => (
        <div key={t.name}>
          <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
            <DatabaseIcon className="w-4 h-4 text-accent-start" />
            {t.name}
            <span className="text-text-tertiary font-normal">({t.rows.length})</span>
          </h3>
          <pre className="overflow-x-auto bg-surface border border-border-subtle rounded-[var(--radius-lg)] p-4 text-xs text-text-secondary max-h-72">
            {JSON.stringify(t.rows, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ── Page shell ──────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  // Admin session lives in browser storage: read it only after hydration.
  const hydrated = useHydrated();
  const hasToken = hydrated && !!getAdminToken();
  const admin = hasToken ? getAdminUser() : null;
  const adminId = admin?.id ?? null;
  const adminName = admin?.name ?? "Admin";
  const ready = hasToken;

  useEffect(() => {
    if (hydrated && !hasToken) router.replace("/admin/login");
  }, [hydrated, hasToken, router]);

  function signOut() {
    clearAdminSession();
    // Return to the combined portal so both User and Admin sign-in are available.
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <p className="text-sm text-text-tertiary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 h-14 bg-surface border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-accent-start" />
          <span className="font-semibold text-text-primary">Durotto Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-text-secondary">{adminName}</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Open app</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm font-medium text-danger hover:opacity-80"
          >
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6">
        {/* Tabs — wrap so every section stays visible (no horizontal scroll) */}
        <nav className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                  active
                    ? "bg-accent-gradient text-white"
                    : "bg-surface-elevated border border-border-subtle text-text-secondary hover:text-text-primary",
                )}
                style={{ borderRadius: "var(--radius-md)" }}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab currentAdminId={adminId} />}
        {tab === "logins" && <LoginsTab />}
        {tab === "calls" && <CallsTab />}
        {tab === "database" && <DatabaseTab />}
      </div>
    </div>
  );
}
