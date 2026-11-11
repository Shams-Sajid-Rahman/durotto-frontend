"use client";

import { useMemo } from "react";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { FileTab } from "@/components/chat/FileTab";
import type { RoomFile, RoomMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  currentUserId: string;
  value: string;
  onChange: (value: string) => void;
  messages: RoomMessage[];
  files: RoomFile[];
  activeTab: "messages" | "files";
  onTabChange: (tab: "messages" | "files") => void;
  onSendMessage: () => void;
  onAttachFile: (file: File) => void;
  onDownloadFile: (file: RoomFile) => void;
  uploadingFileName?: string | null;
  uploadProgress?: number | null;
  reconnecting: boolean;
  disabled?: boolean;
  error?: string | null;
}

export function ChatPanel({
  currentUserId,
  value,
  onChange,
  messages,
  files,
  activeTab,
  onTabChange,
  onSendMessage,
  onAttachFile,
  onDownloadFile,
  uploadingFileName,
  uploadProgress,
  reconnecting,
  disabled = false,
  error,
}: ChatPanelProps) {
  const filesById = useMemo(
    () => new Map(files.map((file) => [file.id, file] as const)),
    [files],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-full border border-border-subtle bg-surface p-2">
        <button
          type="button"
          className={cn(
            "flex-1 rounded-full px-4 py-3 text-sm font-semibold transition",
            activeTab === "messages"
              ? "bg-accent-start text-black"
              : "bg-transparent text-text-secondary hover:bg-base/80",
          )}
          onClick={() => onTabChange("messages")}
        >
          Messages
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded-full px-4 py-3 text-sm font-semibold transition",
            activeTab === "files"
              ? "bg-accent-start text-black"
              : "bg-transparent text-text-secondary hover:bg-base/80",
          )}
          onClick={() => onTabChange("files")}
        >
          Files
        </button>
      </div>

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-danger/30 bg-[#FEE2E2] px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden">
        {activeTab === "messages" ? (
          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            onDownloadFile={onDownloadFile}
            filesById={filesById}
          />
        ) : (
          <FileTab files={files} onDownload={onDownloadFile} />
        )}
      </div>

      <MessageComposer
        value={value}
        onChange={onChange}
        onSubmit={onSendMessage}
        onAttachFile={onAttachFile}
        disabled={disabled || reconnecting}
        uploadingFileName={uploadingFileName}
        uploadProgress={uploadProgress}
        reconnecting={reconnecting}
      />
    </div>
  );
}
