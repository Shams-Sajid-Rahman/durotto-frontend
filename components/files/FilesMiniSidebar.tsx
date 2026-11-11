"use client";

import { FolderOpen, Share2, Clock3, Star, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilesTab = "all" | "shared" | "recent" | "favorites" | "trash";

interface FilesMiniSidebarProps {
  activeTab: FilesTab;
  onSelectTab: (tab: FilesTab) => void;
  onUploadClick: () => void;
  compact?: boolean;
}

const ITEMS: Array<{ key: FilesTab; label: string; icon: typeof FolderOpen }> = [
  { key: "all", label: "All Files", icon: FolderOpen },
  { key: "shared", label: "Shared with me", icon: Share2 },
  { key: "recent", label: "Recent", icon: Clock3 },
  { key: "favorites", label: "Favorites", icon: Star },
  { key: "trash", label: "Trash", icon: Trash2 },
];

export function FilesMiniSidebar({ activeTab, onSelectTab, onUploadClick, compact = false }: FilesMiniSidebarProps) {
  return (
    <aside className={cn("w-full lg:w-64", compact ? "mb-4" : "pr-4") }>
      <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-3 lg:sticky lg:top-20">
        <button
          type="button"
          onClick={onUploadClick}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent-gradient px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
        >
          <Upload className="h-4 w-4" />
          Upload File
        </button>

        <nav className={cn("flex gap-2 overflow-x-auto lg:flex-col", compact && "pb-1")}
          aria-label="Files sections"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeTab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectTab(item.key)}
                className={cn(
                  "flex min-w-max items-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                  active
                    ? "bg-accent-gradient text-white"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
