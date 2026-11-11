"use client";

import { cn } from "@/lib/utils";

interface SidePanelProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function SidePanel({ title, open, onClose, children }: SidePanelProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-end justify-end bg-black/30 transition-opacity duration-300",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "h-full w-full max-w-[min(100vw,420px)] sm:max-w-[380px] bg-surface-elevated border-l border-border-subtle p-5 shadow-2xl shadow-black/30 transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-subtle px-3 py-2 text-sm text-text-secondary transition hover:border-accent-start hover:text-accent-start"
          >
            Close
          </button>
        </div>
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
