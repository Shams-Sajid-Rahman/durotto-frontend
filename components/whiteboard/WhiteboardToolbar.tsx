"use client";

import type { ReactNode } from "react";
import { Pencil, Square, Circle, Type, StickyNote, Eraser, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WhiteboardTool = "select" | "pen" | "rectangle" | "ellipse" | "text" | "sticky" | "eraser";

const TOOL_CONFIG: Array<{ key: WhiteboardTool; icon: ReactNode; label: string }> = [
  { key: "select", icon: <MousePointer2 className="h-4 w-4" />, label: "Select" },
  { key: "pen", icon: <Pencil className="h-4 w-4" />, label: "Pen" },
  { key: "rectangle", icon: <Square className="h-4 w-4" />, label: "Rectangle" },
  { key: "ellipse", icon: <Circle className="h-4 w-4" />, label: "Ellipse" },
  { key: "text", icon: <Type className="h-4 w-4" />, label: "Text" },
  { key: "sticky", icon: <StickyNote className="h-4 w-4" />, label: "Sticky" },
  { key: "eraser", icon: <Eraser className="h-4 w-4" />, label: "Eraser" },
];

interface WhiteboardToolbarProps {
  activeTool: WhiteboardTool;
  onSelectTool: (tool: WhiteboardTool) => void;
  compact?: boolean;
}

export function WhiteboardToolbar({ activeTool, onSelectTool, compact = false }: WhiteboardToolbarProps) {
  return (
    <div
      className={cn(
        "absolute left-4 top-4 z-20 flex flex-col gap-2 rounded-full bg-surface p-2 shadow-xl shadow-black/10",
        compact ? "p-1" : "p-2",
      )}
    >
      {TOOL_CONFIG.map((tool) => {
        const isActive = tool.key === activeTool;
        return (
          <button
            key={tool.key}
            type="button"
            onClick={() => onSelectTool(tool.key)}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
              isActive
                ? "bg-gradient-to-br from-[#7C5CFF] to-[#3D8BFF] text-black"
                : "bg-transparent text-text-secondary hover:bg-surface-elevated",
            )}
            aria-label={tool.label}
            title={tool.label}
          >
            {tool.icon}
          </button>
        );
      })}
    </div>
  );
}
