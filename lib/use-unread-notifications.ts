"use client";

import { useEffect, useState } from "react";
import { notificationsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const REFRESH_MS = 60_000;
export const NOTIFICATIONS_CHANGED_EVENT = "durotto:notifications-changed";

/** Tell badges to refetch (e.g. after marking notifications read). */
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

/** Unread notification count for badges; polls and listens for local changes. */
export function useUnreadNotifications(): number {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const refresh = () => {
      notificationsApi
        .list()
        .then((items) => {
          if (active) setCount(items.filter((n) => !n.isRead).length);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [isAuthenticated]);

  return isAuthenticated ? count : 0;
}
