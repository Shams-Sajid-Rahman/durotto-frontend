"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Video,
  Pencil,
  FolderOpen,
  MessageSquare,
  Bell,
  Settings,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";

// ── Nav config ────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/whiteboard", label: "Whiteboard", icon: Pencil },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/profile", label: "Profile", icon: User },
];

function isNavActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function DurottoLogo() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
        <div
          className="w-6 h-6 rotate-45 rounded-[4px]"
          style={{
            background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rotate-45 rounded-[1px] bg-white/20" />
        </div>
      </div>
      <span
        className="text-base font-semibold"
        style={{
          background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Durotto
      </span>
    </div>
  );
}

// ── Desktop nav item ──────────────────────────────────────────────────────────

function DesktopNavItem({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 w-full px-3.5 py-2.5 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-inset",
        active
          ? "bg-accent-gradient text-white"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
      )}
      style={{ borderRadius: "var(--radius-md)" }}
      aria-current={active ? "page" : undefined}
    >
      <span className="relative shrink-0">
        <Icon className={cn("w-5 h-5", active ? "text-white" : "text-text-tertiary")} />
        {item.badge ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </span>
      {item.label}
    </Link>
  );
}

// ── User mini-card ────────────────────────────────────────────────────────────

function UserMiniCard() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div
        className="flex items-center gap-2.5 p-3 bg-surface-elevated animate-pulse"
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        <div className="w-9 h-9 rounded-full bg-border-subtle shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-2.5 bg-border-subtle rounded-full w-3/4" />
          <div className="h-2 bg-border-subtle rounded-full w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/profile"
      className="flex items-center gap-2.5 p-3 bg-surface-elevated transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <PresenceAvatar name={user.name} status="online" size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate leading-tight">
          {user.name}
        </p>
        <p className="text-[12px] text-success leading-tight">Online</p>
      </div>
    </Link>
  );
}

// ── Mobile bottom nav item ────────────────────────────────────────────────────

function MobileNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-col items-center gap-1 px-2 py-1 flex-1",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-inset rounded-md",
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className="relative">
        <Icon
          className={cn(
            "w-5 h-5",
            active ? "text-accent-start" : "text-text-tertiary",
          )}
        />
        {item.badge ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-white text-[9px] font-semibold flex items-center justify-center leading-none">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium",
          active ? "text-accent-start" : "text-text-tertiary",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

// ── Sidebar (desktop) + BottomNav (mobile) ────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const unread = useUnreadNotifications();
  const withBadge = (item: NavItem): NavItem =>
    item.href === "/notifications" ? { ...item, badge: unread } : item;

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 flex-col bg-surface border-r border-border-subtle z-40">
        <DurottoLogo />

        {/* Divider */}
        <div className="mx-4 h-px bg-border-subtle mb-2" />

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <DesktopNavItem
              key={item.href}
              item={withBadge(item)}
              active={isNavActive(pathname, item)}
            />
          ))}
        </nav>

        {/* User mini-card */}
        <div className="p-3 mt-auto border-t border-border-subtle">
          <UserMiniCard />
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 flex items-center bg-surface border-t border-border-subtle z-40 px-2 safe-area-pb">
        {MOBILE_ITEMS.map((item) => (
          <MobileNavItem
            key={item.href}
            item={withBadge(item)}
            active={isNavActive(pathname, item)}
          />
        ))}
      </nav>
    </>
  );
}
