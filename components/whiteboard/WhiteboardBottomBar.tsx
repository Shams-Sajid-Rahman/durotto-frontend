"use client";

import { CopyPlus, Loader2, Minus, Plus, RotateCcw, RotateCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhiteboardBottomBarProps {
  color: string;
  onSelectColor: (color: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Save the board as an image to Files. */
  onSave?: () => void;
  /** Save as a new file instead of updating the open one. */
  onSaveCopy?: () => void;
  saving?: boolean;
  compact?: boolean;
}

const COLORS = ["#111827", "#2563EB", "#9333EA", "#DC2626", "#047857", "#F59E0B"];

export function WhiteboardBottomBar({
  color,
  onSelectColor,
  zoom,
  onZoomChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onSaveCopy,
  saving = false,
  compact = false,
}: WhiteboardBottomBarProps) {
  return (
    <div
      className={cn(
        "absolute bottom-4 left-1/2 z-20 flex items-center justify-between gap-4 rounded-full bg-surface-elevated px-4 py-3 shadow-xl shadow-black/10",
        compact ? "left-3 right-3" : "-translate-x-1/2 min-w-[360px]",
      )}
    >
      <div className="flex items-center gap-2">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onSelectColor(swatch)}
            className={cn(
              "h-8 w-8 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
              swatch === color ? "border-accent-start" : "border-border-subtle",
            )}
            style={{ backgroundColor: swatch }}
            aria-label={`Select ${swatch} color`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onZoomChange(zoom - 0.1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[60px] text-center text-sm font-semibold text-text-primary">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => onZoomChange(zoom + 0.1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
            canUndo ? "bg-surface text-text-secondary hover:bg-surface-elevated" : "bg-base text-text-tertiary cursor-not-allowed",
          )}
          aria-label="Undo"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
            canRedo ? "bg-surface text-text-secondary hover:bg-surface-elevated" : "bg-base text-text-tertiary cursor-not-allowed",
          )}
          aria-label="Redo"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        {onSaveCopy ? (
          <button
            type="button"
            onClick={onSaveCopy}
            disabled={saving}
            title="Save as a new file"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start disabled:cursor-wait disabled:opacity-60"
            aria-label="Save a copy to Files"
          >
            <CopyPlus className="h-4 w-4" />
          </button>
        ) : null}
        {onSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            title="Save to Files"
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-accent-gradient text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start disabled:cursor-wait disabled:opacity-70",
              compact ? "w-10" : "px-4",
            )}
            aria-label="Save whiteboard to Files"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {compact ? null : saving ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
