"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Plus, Search } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { cn } from "@/lib/utils";

// ── Notification bell with badge ──────────────────────────────────────────────

function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      className="relative p-2 text-text-secondary hover:text-text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
      aria-label={`Notifications — ${count} unread`}
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

// ── Search input with ⌘K shortcut ─────────────────────────────────────────────

function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 bg-surface-elevated border transition-colors duration-150",
        focused
          ? "border-accent-start ring-1 ring-accent-start/30"
          : "border-border-subtle",
      )}
      style={{ borderRadius: "var(--radius-full)", maxWidth: 320, minWidth: 200 }}
    >
      <Search className="w-4 h-4 text-text-tertiary shrink-0" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search…"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none min-w-0"
        aria-label="Search"
      />
      <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary bg-border-subtle rounded border border-border-subtle shrink-0 select-none">
        ⌘K
      </kbd>
    </div>
  );
}

// ── Create Room button ────────────────────────────────────────────────────────

function CreateRoomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-accent-gradient
        transition-all duration-150 hover:brightness-110
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-offset-2 focus-visible:ring-offset-base"
      style={{ borderRadius: "var(--radius-md)" }}
    >
      <Plus className="w-4 h-4" />
      <span className="hidden sm:inline">Create Room</span>
    </button>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export function TopBar() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const unreadCount = useUnreadNotifications();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 h-[60px] bg-surface border-b border-border-subtle">
      {/* Search — takes available space */}
      <div className="flex-1">
        <SearchInput />
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <NotificationBell count={unreadCount} />
        <CreateRoomButton onClick={() => setCreateOpen(true)} />
        {user && (
          <Link
            href="/profile"
            aria-label="Your profile"
            title="Your profile"
            className="ml-1 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          >
            <PresenceAvatar
              name={user.name}
              status="online"
              size="sm"
            />
          </Link>
        )}
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
