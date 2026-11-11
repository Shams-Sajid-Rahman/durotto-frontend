"use client";

import { Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
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
      </div>
    </div>
  );
}
