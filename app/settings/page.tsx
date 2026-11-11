"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Settings,
  Bell,
  Palette,
  Monitor,
  Shield,
  Globe,
  Info,
  Check,
  LogOut,
  ChevronLeft,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useTheme, type Theme } from "@/lib/theme-context";
import { ApiError, users, type SignInEntry, type UserSettings } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import {
  SettingsGroup,
  SettingsListRow,
  StyledSelect,
} from "@/components/shared/SettingsListRow";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  status: "online",
  notifications: {
    meetingReminders: true,
    chatMessages: true,
    fileUploads: true,
    sounds: false,
  },
  theme: "dark",
};

type TabKey =
  | "general"
  | "notifications"
  | "appearance"
  | "devices"
  | "privacy"
  | "language"
  | "about";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { key: "general", label: "General", icon: Settings },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "devices", label: "Devices", icon: Monitor },
  { key: "privacy", label: "Privacy & Security", icon: Shield },
  { key: "language", label: "Language", icon: Globe },
  { key: "about", label: "About", icon: Info },
];

// ── Panels ────────────────────────────────────────────────────────────────────

function GeneralPanel({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (patch: Partial<UserSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wide mb-2">
          Presence
        </h3>
        <SettingsGroup>
          <SettingsListRow
            variant="select"
            label="Status"
            sublabel="How others see you"
            icon={<span className="w-2 h-2 rounded-full bg-success inline-block" />}
            value={settings.status}
            options={[
              { value: "online", label: "Online" },
              { value: "away", label: "Away" },
              { value: "dnd", label: "Do Not Disturb" },
              { value: "offline", label: "Appear Offline" },
            ]}
            onChange={(v) => onChange({ status: v as UserSettings["status"] })}
          />
        </SettingsGroup>
      </div>

    </div>
  );
}

function NotificationsPanel({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (patch: Partial<UserSettings>) => void;
}) {
  function toggleNotif(key: keyof UserSettings["notifications"], value: boolean) {
    onChange({ notifications: { ...settings.notifications, [key]: value } });
  }

  return (
    <div className="space-y-6">
      <SettingsGroup>
        <SettingsListRow
          variant="toggle"
          label="Meeting reminders"
          sublabel="Notify before a scheduled meeting starts"
          checked={settings.notifications.meetingReminders}
          onCheckedChange={(v) => toggleNotif("meetingReminders", v)}
        />
        <SettingsListRow
          variant="toggle"
          label="Chat messages"
          sublabel="Notify when someone sends you a message"
          checked={settings.notifications.chatMessages}
          onCheckedChange={(v) => toggleNotif("chatMessages", v)}
        />
        <SettingsListRow
          variant="toggle"
          label="File uploads"
          sublabel="Notify when a file is added to your rooms"
          checked={settings.notifications.fileUploads}
          onCheckedChange={(v) => toggleNotif("fileUploads", v)}
        />
        <SettingsListRow
          variant="toggle"
          label="Sounds"
          sublabel="Play audio for incoming notifications"
          checked={settings.notifications.sounds}
          onCheckedChange={(v) => toggleNotif("sounds", v)}
        />
      </SettingsGroup>
    </div>
  );
}

function AppearancePanel({
  settings,
  onChange,
}: {
  settings: UserSettings;
  onChange: (patch: Partial<UserSettings>) => void;
}) {
  const { setTheme } = useTheme();
  const themes: { value: Theme; label: string; swatchBg: string; swatchFg: string }[] = [
    { value: "dark", label: "Dark", swatchBg: "#0B0B14", swatchFg: "#F5F5F7" },
    { value: "light", label: "Light", swatchBg: "#F5F5F7", swatchFg: "#0B0B14" },
    { value: "system", label: "System", swatchBg: "linear-gradient(135deg,#0B0B14 50%,#F5F5F7 50%)", swatchFg: "#9CA0B3" },
  ];
  const current = settings.theme as Theme;

  function handleTheme(t: Theme) {
    setTheme(t);
    onChange({ theme: t });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Choose how Durotto looks for you. &ldquo;System&rdquo; follows your device setting.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {themes.map((t) => {
          const active = current === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTheme(t.value)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 bg-surface border-2 transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                active ? "border-accent-start" : "border-border-subtle hover:border-text-tertiary/40",
              )}
              style={{ borderRadius: "var(--radius-lg)" }}
            >
              {/* Swatch preview */}
              <div
                className="w-full h-12 rounded-md border border-border-subtle flex items-center justify-center"
                style={{ background: t.swatchBg, borderRadius: "var(--radius-sm)" }}
              >
                <span className="text-[10px] font-semibold" style={{ color: t.swatchFg }}>
                  Aa
                </span>
              </div>
              <div className="flex items-center gap-1">
                {active && <Check className="w-3.5 h-3.5 text-accent-start" />}
                <span className={cn("text-sm font-medium", active ? "text-text-primary" : "text-text-secondary")}>
                  {t.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Chrome on Windows"-style label from a user-agent string. */
function describeUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}

function DevicesPanel() {
  const { logout } = useAuth();
  const [entries, setEntries] = useState<SignInEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    users
      .signIns()
      .then((list) => active && setEntries(list))
      .catch((e) => {
        if (!active) return;
        setEntries([]);
        setError(e instanceof ApiError ? e.message : "Could not load sign-in history.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Recent sign-ins to your account. If you don&rsquo;t recognise one, change your password
        from your profile.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <SettingsGroup>
        {entries === null ? (
          <p className="px-4 py-3.5 text-sm text-text-tertiary bg-surface">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-3.5 text-sm text-text-tertiary bg-surface">No sign-ins recorded.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3.5 bg-surface border-b border-border-subtle last:border-0"
            >
              <Monitor className="w-5 h-5 text-text-secondary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {describeUserAgent(entry.userAgent)}
                  {!entry.success && (
                    <span className="ml-2 text-[11px] font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded-full">
                      Failed attempt
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-text-tertiary">
                  {new Date(entry.at).toLocaleString()}
                  {entry.ip !== "local" ? ` · ${entry.ip}` : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </SettingsGroup>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-1.5 text-sm font-medium text-danger hover:text-danger/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger rounded-sm"
      >
        <LogOut className="w-4 h-4" /> Sign out of this device
      </button>
    </div>
  );
}

function DeleteAccountModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPassword("");
      setError(null);
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await users.deleteMe(password);
      onOpenChange(false);
      logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Delete account"
      description="This permanently deletes your account, the rooms you host, and your files. It cannot be undone."
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleDelete} className="space-y-4">
        <label className="block text-sm text-text-secondary">
          Confirm with your password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-danger"
            required
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="px-4 py-2 text-sm font-semibold text-white bg-danger rounded-[var(--radius-md)] disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrivacyPanel() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    try {
      const blob = await users.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "durotto-export.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-medium text-text-tertiary uppercase tracking-wide mb-2">
          Data
        </h3>
        <SettingsGroup>
          <SettingsListRow
            variant="nav"
            label="Export my data"
            sublabel="Download a JSON copy of your profile, rooms, files list and messages"
            onClick={() => void handleExport()}
          />
          <SettingsListRow
            variant="nav"
            label="Delete account"
            sublabel="Permanently remove your account and data"
            onClick={() => setDeleteOpen(true)}
          />
        </SettingsGroup>
        {exportError && <p className="mt-2 text-sm text-danger">{exportError}</p>}
      </div>
      <DeleteAccountModal open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}

function LanguagePanel() {
  return (
    <div className="space-y-4">
      <SettingsGroup>
        <div className="flex items-center gap-3 px-4 py-3.5 bg-surface">
          <Globe className="w-4 h-4 text-text-secondary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">App language</p>
          </div>
          <StyledSelect
            value="en"
            onChange={() => {}}
            options={[{ value: "en", label: "English" }]}
            label="App language"
          />
        </div>
      </SettingsGroup>
      <p className="text-[12px] text-text-tertiary">
        Durotto is currently available in English only.
      </p>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-4">
      <SettingsGroup>
        <div className="flex items-center justify-between px-4 py-3.5 bg-surface border-b border-border-subtle">
          <p className="text-sm font-medium text-text-primary">Version</p>
          <p className="text-sm text-text-secondary">0.1.0-alpha</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 bg-surface border-b border-border-subtle">
          <p className="text-sm font-medium text-text-primary">Built with</p>
          <p className="text-sm text-text-secondary">Next.js 16 · FastAPI</p>
        </div>
        <SettingsListRow variant="nav" label="Terms of Service" href="/legal/terms" />
        <SettingsListRow variant="nav" label="Privacy Policy" href="/legal/privacy" />
        <SettingsListRow variant="nav" label="Open source licenses" href="/legal/licenses" />
      </SettingsGroup>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

function isTabKey(value: string | null): value is TabKey {
  return value != null && TABS.some((t) => t.key === value);
}

function SettingsPanel() {
  const { logout } = useAuth();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: TabKey = isTabKey(tabParam) ? tabParam : "general";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // Deep-linked (?tab=…) opens straight to the panel on mobile.
  const [mobileShowPanel, setMobileShowPanel] = useState(isTabKey(tabParam));
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { setTheme } = useTheme();

  useEffect(() => {
    let active = true;
    users
      .settings()
      .then((s) => {
        if (!active) return;
        setSettings(s);
        setTheme(s.theme); // the saved preference follows you across devices
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [setTheme]);

  const handleChange = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const merged: UserSettings = {
        ...prev,
        ...patch,
        notifications: { ...prev.notifications, ...(patch.notifications ?? {}) },
      };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        users.updateSettings(merged).catch(console.error);
      }, 600);
      return merged;
    });
  }, []);

  function selectTab(key: TabKey) {
    setActiveTab(key);
    setMobileShowPanel(true);
  }

  const activeTabDef = TABS.find((t) => t.key === activeTab)!;

  const panels: Record<TabKey, React.ReactNode> = {
    general: <GeneralPanel settings={settings} onChange={handleChange} />,
    notifications: <NotificationsPanel settings={settings} onChange={handleChange} />,
    appearance: <AppearancePanel settings={settings} onChange={handleChange} />,
    devices: <DevicesPanel />,
    privacy: <PrivacyPanel />,
    language: <LanguagePanel />,
    about: <AboutPanel />,
  };

  if (!settingsLoaded) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-48">
        <p className="text-sm text-text-tertiary">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px]">
      <h1 className="text-[22px] font-semibold text-text-primary mb-6">Settings</h1>

      <div className="flex flex-col md:flex-row md:gap-6">
        {/* ── Tab list ── */}

        {/* Mobile: horizontal scrollable strip */}
        <div className="md:hidden w-full mb-4">
          {mobileShowPanel ? (
            <button
              type="button"
              onClick={() => setMobileShowPanel(false)}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Settings
            </button>
          ) : (
            <nav className="flex overflow-x-auto gap-1 pb-1 scrollbar-none">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectTab(tab.key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                      active
                        ? "bg-accent-gradient text-white"
                        : "text-text-secondary hover:bg-surface-elevated",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Desktop: vertical tab list */}
        <nav className="hidden md:flex flex-col gap-0.5 w-48 shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium w-full text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-inset",
                  active
                    ? "bg-accent-gradient text-white"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                )}
                style={{ borderRadius: "var(--radius-md)" }}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}

          <div className="mt-auto pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              style={{ borderRadius: "var(--radius-md)" }}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          </div>
        </nav>

        {/* ── Content panel ── */}

        {/* Always shown on desktop; on mobile only once a tab is picked. */}
        <div className={cn("flex-1 min-w-0", !mobileShowPanel && "hidden md:block")}>
          <h2 className="mb-5 text-base font-semibold text-text-primary">
            {activeTabDef.label}
          </h2>
          {panels[activeTab]}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6 flex items-center justify-center h-48">
          <p className="text-sm text-text-tertiary">Loading settings…</p>
        </div>
      }
    >
      <SettingsPanel />
    </Suspense>
  );
}
