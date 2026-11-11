"use client";

import { useMemo } from "react";
import { Download, FileText, ImageIcon, FileVideo, FileAudio, File } from "lucide-react";
import type { RoomFile } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileTabProps {
  files: RoomFile[];
  onDownload: (file: RoomFile) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  png: <ImageIcon className="h-4 w-4" />,
  jpg: <ImageIcon className="h-4 w-4" />,
  jpeg: <ImageIcon className="h-4 w-4" />,
  gif: <ImageIcon className="h-4 w-4" />,
  zip: <File className="h-4 w-4" />,
  rar: <File className="h-4 w-4" />,
  mp4: <FileVideo className="h-4 w-4" />,
  mov: <FileVideo className="h-4 w-4" />,
  mp3: <FileAudio className="h-4 w-4" />,
  wav: <FileAudio className="h-4 w-4" />,
};

function getFileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return iconMap[extension] ?? <File className="h-4 w-4" />;
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatFileSize(size: number) {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  if (size >= 1000) return `${(size / 1000).toFixed(1)} KB`;
  return `${size} B`;
}

export function FileTab({ files, onDownload }: FileTabProps) {
  const sorted = useMemo(
    () => [...files].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    [files],
  );

  if (files.length === 0) {
    return (
      <div className="flex h-[calc(100vh-320px)] flex-col items-center justify-center rounded-[var(--radius-lg)] bg-surface border border-border-subtle text-text-secondary">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-base text-accent-start">
          <FileText className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-text-primary">No files shared yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-3" style={{ maxHeight: "calc(100vh - 320px)" }}>
      {sorted.map((file) => (
        <div
          key={file.id}
          className="grid gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 transition hover:border-accent-start"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-base text-accent-start">
              {getFileIcon(file.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
              <p className="text-[12px] text-text-tertiary">{formatFileSize(file.size)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px] text-text-secondary">
            <span>{file.uploaderName}</span>
            <span>{formatTime(file.uploadedAt)}</span>
          </div>
          <button
            type="button"
            onClick={() => onDownload(file)}
            className={cn(
              "inline-flex items-center gap-2 self-start rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition",
              "bg-accent-gradient text-black hover:brightness-110",
            )}
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      ))}
    </div>
  );
}
