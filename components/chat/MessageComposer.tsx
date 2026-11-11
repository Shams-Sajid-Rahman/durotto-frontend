"use client";

import { useEffect, useRef } from "react";
import { Paperclip, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttachFile: (file: File) => void;
  disabled: boolean;
  uploadingFileName?: string | null;
  uploadProgress?: number | null;
  reconnecting: boolean;
}

export function MessageComposer({
  value,
  onChange,
  onSubmit,
  onAttachFile,
  disabled,
  uploadingFileName,
  uploadProgress,
  reconnecting,
}: MessageComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(120, inputRef.current.scrollHeight)}px`;
  }, [value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim().length > 0) {
        onSubmit();
      }
    }
  };

  const handleAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onAttachFile(file);
    }
    event.target.value = "";
  };

  return (
    <div className="rounded-full bg-surface-elevated border border-border-subtle px-3 py-2 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAttach}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <div className="flex-1">
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={reconnecting ? "Reconnecting..." : "Type a message..."}
            className="min-h-[40px] w-full resize-none border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-0"
            disabled={disabled}
            style={{ maxHeight: 120 }}
            aria-label="Message composer"
          />
          {uploadingFileName ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-base/60 px-3 py-2 text-xs text-text-secondary">
              <span>Uploading {uploadingFileName}</span>
              <span>{uploadProgress != null ? `${Math.round(uploadProgress * 100)}%` : "…"}</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || value.trim().length === 0}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
            disabled ? "bg-surface text-text-tertiary" : "bg-accent-gradient text-black hover:brightness-110",
          )}
          aria-label="Send message"
        >
          {reconnecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
