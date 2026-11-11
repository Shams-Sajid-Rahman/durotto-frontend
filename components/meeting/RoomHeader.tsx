"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomHeaderProps {
  title: string;
  elapsedTime: string;
  participantCount: number;
  joinCode?: string;
  onOpenParticipants: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function RoomHeader({
  title,
  elapsedTime,
  participantCount,
  joinCode,
  onOpenParticipants,
  isCollapsed,
  onToggleCollapse,
}: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopyCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <div className="sticky top-0 z-20 border-b border-border-subtle bg-surface/95 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-4 py-4 md:px-6 md:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Meeting room</p>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-lg font-semibold text-text-primary truncate">{title}</h1>
              {joinCode && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  title={copied ? "Copied!" : `Copy invite code: ${joinCode}`}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium rounded-full border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                    copied
                      ? "border-success/40 text-success bg-success/10"
                      : "border-border-subtle text-text-tertiary bg-surface-elevated hover:border-accent-start/60 hover:text-accent-start",
                  )}
                  aria-label={copied ? "Copied!" : "Copy invite code"}
                >
                  {copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? "Copied!" : joinCode}
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated text-text-secondary transition hover:border-accent-start hover:text-accent-start md:hidden"
            aria-label={isCollapsed ? "Expand header" : "Minimize header"}
          >
            {isCollapsed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        <div
          className={cn(
            "grid gap-3 sm:grid-cols-[1fr_auto]",
            isCollapsed ? "hidden" : "grid",
          )}
        >
          <div className="rounded-[var(--radius-xl)] bg-surface-elevated border border-border-subtle p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-text-secondary">Live call duration</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">{elapsedTime}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-base/70 px-3 py-2 text-sm font-medium text-text-primary">
              <Users className="h-4 w-4 text-accent-start" />
              {participantCount} Participant{participantCount === 1 ? "" : "s"}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenParticipants}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-xl)] bg-surface-elevated border border-border-subtle px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-accent-start hover:text-accent-start"
          >
            <Users className="w-4 h-4" />
            Participants
          </button>
        </div>
      </div>
    </div>
  );
}
