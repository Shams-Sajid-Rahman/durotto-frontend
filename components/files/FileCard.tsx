"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageIcon, FileVideo, FileAudio, File, MoreHorizontal, Star, Share2, Pencil, Trash2, RotateCcw, Trash, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoomFile } from "@/lib/api";

interface FileCardProps {
  file: RoomFile;
  viewMode: "grid" | "list";
  currentUserId?: string;
  onDownload: (file: RoomFile) => void;
  onFavoriteToggle: (file: RoomFile) => void;
  onShare?: (file: RoomFile) => void;
  /** Open in the whiteboard (offered for images). */
  onOpen?: (file: RoomFile) => void;
  onRename: (file: RoomFile) => void;
  onDelete: (file: RoomFile) => void;
  onRestore?: (file: RoomFile) => void;
  onDeleteForever?: (file: RoomFile) => void;
  activeTab?: "all" | "shared" | "recent" | "favorites" | "trash";
}

const iconMap: Record<string, React.ReactNode> = {
  png: <ImageIcon className="h-6 w-6" />,
  jpg: <ImageIcon className="h-6 w-6" />,
  jpeg: <ImageIcon className="h-6 w-6" />,
  gif: <ImageIcon className="h-6 w-6" />,
  zip: <File className="h-6 w-6" />,
  rar: <File className="h-6 w-6" />,
  mp4: <FileVideo className="h-6 w-6" />,
  mov: <FileVideo className="h-6 w-6" />,
  mp3: <FileAudio className="h-6 w-6" />,
  wav: <FileAudio className="h-6 w-6" />,
};

function getFileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return iconMap[extension] ?? <File className="h-6 w-6" />;
}

function getFileAccent(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "bg-[#EF4444]/15 text-[#F87171]";
  if (["doc", "docx"].includes(extension)) return "bg-[#3B82F6]/15 text-[#60A5FA]";
  if (["xls", "xlsx"].includes(extension)) return "bg-[#22C55E]/15 text-[#4ADE80]";
  if (["zip", "rar"].includes(extension)) return "bg-[#F59E0B]/15 text-[#FBBF24]";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) return "bg-[#8B5CF6]/15 text-[#A78BFA]";
  return "bg-surface-elevated text-text-secondary";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function FileCard({
  file,
  viewMode,
  currentUserId,
  onDownload,
  onFavoriteToggle,
  onShare,
  onOpen,
  onRename,
  onDelete,
  onRestore,
  onDeleteForever,
  activeTab = "all",
}: FileCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const canManage = currentUserId ? file.uploaderId === currentUserId : false;
  const canOpen = !!onOpen && file.mimeType.startsWith("image/") && !file.deletedAt;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const title = useMemo(() => file.name, [file.name]);
  const type = useMemo(() => {
    const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
    return extension === "JPG" || extension === "JPEG" || extension === "PNG" || extension === "GIF" || extension === "WEBP" ? "IMAGE" : extension;
  }, [file.name]);

  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            disabled={!canOpen}
            onClick={() => onOpen?.(file)}
            title={canOpen ? "Open in Whiteboard" : undefined}
            aria-label={canOpen ? `Open ${file.name} in Whiteboard` : file.name}
            className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition", getFileAccent(file.name), canOpen ? "cursor-pointer hover:ring-2 hover:ring-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start" : "cursor-default")}
          >
            {getFileIcon(file.name)}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-text-primary" title={title}>{title}</p>
              <button
                type="button"
                onClick={() => onFavoriteToggle(file)}
                className="rounded-full p-1 text-text-tertiary transition hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
                aria-label={file.isFavorite ? "Remove favorite" : "Add favorite"}
              >
                <Star className={cn("h-4 w-4", file.isFavorite && "fill-accent-start text-accent-start")} />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
              <span>{type}</span>
              <span>·</span>
              <span>{formatFileSize(file.size)}</span>
              <span>·</span>
              <span>{formatDate(file.uploadedAt)}</span>
              {file.roomName ? <><span>·</span><span>{file.roomName}</span></> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => onDownload(file)}
            className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-2 text-text-secondary transition hover:border-accent-start hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            aria-label={`Download ${file.name}`}
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-2 text-text-secondary transition hover:border-accent-start hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`More actions for ${file.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div ref={menuRef} className="absolute right-0 top-12 z-20 w-44 rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-2 shadow-xl" role="menu">
                <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDownload(file); setMenuOpen(false); }}><Download className="h-4 w-4" />Download</button>
                {canOpen ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onOpen?.(file); setMenuOpen(false); }}><PenLine className="h-4 w-4" />Open in Whiteboard</button>
                ) : null}
                {onShare ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onShare(file); setMenuOpen(false); }}><Share2 className="h-4 w-4" />Share</button>
                ) : null}
                {canManage ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onRename(file); setMenuOpen(false); }}><Pencil className="h-4 w-4" />Rename</button>
                ) : null}
                {!canManage ? null : activeTab === "trash" ? (
                  <>
                    <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onRestore?.(file); setMenuOpen(false); }}><RotateCcw className="h-4 w-4" />Restore</button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDeleteForever?.(file); setMenuOpen(false); }}><Trash className="h-4 w-4" />Delete Forever</button>
                  </>
                ) : (
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDelete(file); setMenuOpen(false); }}><Trash2 className="h-4 w-4" />Delete</button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-4 transition hover:border-accent-start">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => onOpen?.(file)}
          title={canOpen ? "Open in Whiteboard" : undefined}
          aria-label={canOpen ? `Open ${file.name} in Whiteboard` : file.name}
          className={cn("flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] transition", getFileAccent(file.name), canOpen ? "cursor-pointer hover:ring-2 hover:ring-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start" : "cursor-default")}
        >
          {getFileIcon(file.name)}
        </button>
        <button
          type="button"
          onClick={() => onFavoriteToggle(file)}
          className="rounded-full p-1 text-text-tertiary transition hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label={file.isFavorite ? "Remove favorite" : "Add favorite"}
        >
          <Star className={cn("h-4 w-4", file.isFavorite && "fill-accent-start text-accent-start")} />
        </button>
      </div>
      <div className="mt-4 min-w-0">
        <p className="truncate text-sm font-medium text-text-primary" title={title}>{title}</p>
        <p className="mt-1 text-xs text-text-tertiary">{type} · {formatFileSize(file.size)}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-text-tertiary">
          <p className="truncate">{file.roomName ?? "Personal"}</p>
          <p>{formatDate(file.uploadedAt)}</p>
        </div>
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-2 text-text-secondary transition hover:border-accent-start hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${file.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div ref={menuRef} className="absolute right-0 top-12 z-20 w-44 rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-2 shadow-xl" role="menu">
              <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDownload(file); setMenuOpen(false); }}><Download className="h-4 w-4" />Download</button>
                {canOpen ? (
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onOpen?.(file); setMenuOpen(false); }}><PenLine className="h-4 w-4" />Open in Whiteboard</button>
                ) : null}
              {onShare ? (
                <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onShare(file); setMenuOpen(false); }}><Share2 className="h-4 w-4" />Share</button>
              ) : null}
              {canManage ? (
                <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onRename(file); setMenuOpen(false); }}><Pencil className="h-4 w-4" />Rename</button>
              ) : null}
              {!canManage ? null : activeTab === "trash" ? (
                <>
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onRestore?.(file); setMenuOpen(false); }}><RotateCcw className="h-4 w-4" />Restore</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDeleteForever?.(file); setMenuOpen(false); }}><Trash className="h-4 w-4" />Delete Forever</button>
                </>
              ) : (
                <button type="button" className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm text-text-primary hover:bg-surface" onClick={() => { onDelete(file); setMenuOpen(false); }}><Trash2 className="h-4 w-4" />Delete</button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
