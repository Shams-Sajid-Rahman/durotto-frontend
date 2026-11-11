"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, UserCheck, FileUp, AtSign, Info, ChevronLeft } from "lucide-react";
import { notificationsApi, type AppNotification, type NotificationType, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { notifyNotificationsChanged } from "@/lib/use-unread-notifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  NotificationType,
  { icon: React.ReactNode; color: string }
> = {
  join:    { icon: <UserCheck className="w-4 h-4" />, color: "#3D8BFF" },
  upload:  { icon: <FileUp    className="w-4 h-4" />, color: "#22C55E" },
  mention: { icon: <AtSign    className="w-4 h-4" />, color: "#7C5CFF" },
  system:  { icon: <Info      className="w-4 h-4" />, color: "#6B7088" },
};

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-border-subtle shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-border-subtle rounded w-2/3" />
        <div className="h-3 bg-border-subtle rounded w-full" />
      </div>
      <div className="h-3 w-14 bg-border-subtle rounded shrink-0" />
    </div>
  );
}

// ── Notification Item ─────────────────────────────────────────────────────────

function NotificationItem({
  notif,
  onMarkRead,
}: {
  notif: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const router = useRouter();
  const meta = TYPE_META[notif.type] ?? TYPE_META.system;

  function handleClick() {
    if (!notif.isRead) onMarkRead(notif.id);
    const target = notif.payload?.targetUrl ?? "/dashboard";
    router.push(target);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 w-full text-left px-4 py-4 transition-colors",
        "border-b border-border-subtle last:border-0",
        "hover:bg-surface-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-start",
        !notif.isRead ? "bg-surface-elevated" : "bg-surface",
      )}
    >
      {/* Icon circle */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `${meta.color}26`, color: meta.color }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-sm font-medium text-text-primary leading-snug flex-1">
            {notif.title}
          </p>
          {!notif.isRead && (
            <span
              className="mt-1.5 w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: "#7C5CFF" }}
              aria-label="Unread"
            />
          )}
        </div>
        <p className="text-[13px] text-text-secondary mt-0.5 leading-snug">{notif.body}</p>
      </div>

      {/* Timestamp */}
      <span className="text-[12px] text-text-tertiary shrink-0 mt-0.5">
        {relativeTime(notif.createdAt)}
      </span>
    </button>
  );
}

// ── Notifications Page ────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    notificationsApi
      .list()
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load notifications."),
      )
      .finally(() => setLoading(false));
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    notificationsApi
      .markRead(id)
      .then(notifyNotificationsChanged)
      .catch(console.error);
  }, []);

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await notificationsApi.markAllRead();
      notifyNotificationsChanged();
    } catch {
      // Optimistic: the next refresh shows the true state.
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = items.filter((n) => !n.isRead).length;

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {/* Back chevron — mobile only */}
        <button
          type="button"
          onClick={() => router.back()}
          className="md:hidden p-1 text-text-secondary hover:text-text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h1 className="text-[22px] font-semibold text-text-primary flex-1">
          Notifications
        </h1>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="text-sm font-medium text-accent-start hover:text-accent-end transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm disabled:opacity-60"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      <div
        className="bg-surface border border-border-subtle overflow-hidden"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <NotificationSkeleton key={i} />)
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
            <p className="text-sm text-danger">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-accent-start hover:text-accent-end transition-colors"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#7C5CFF26" }}
            >
              <Bell className="w-7 h-7 text-accent-start" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                You&apos;re all caught up
              </p>
              <p className="text-sm text-text-secondary mt-1">
                No new notifications right now.
              </p>
            </div>
          </div>
        ) : (
          items.map((notif) => (
            <NotificationItem key={notif.id} notif={notif} onMarkRead={markRead} />
          ))
        )}
      </div>
    </div>
  );
}
