"use client";

import { LayoutGrid, List, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilesToolbarProps {
  title: string;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  sortBy: "name" | "date" | "size";
  onSortChange: (sortBy: "name" | "date" | "size") => void;
}

export function FilesToolbar({ title, viewMode, onViewModeChange, sortBy, onSortChange }: FilesToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(event) => onSortChange(event.target.value as "name" | "date" | "size")}
            className="bg-transparent text-sm text-text-primary focus:outline-none"
            aria-label="Sort files"
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
          </select>
          <ChevronDown className="h-4 w-4" />
        </label>
        <div className="flex rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-1">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "rounded-[var(--radius-sm)] p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
              viewMode === "grid" ? "bg-accent-gradient text-white" : "text-text-secondary hover:text-text-primary",
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={cn(
              "rounded-[var(--radius-sm)] p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
              viewMode === "list" ? "bg-accent-gradient text-white" : "text-text-secondary hover:text-text-primary",
            )}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
