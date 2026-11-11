"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageIcon, FileVideo, FileAudio, FileArchive } from "lucide-react";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import type { RoomFile, RoomMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: RoomMessage[];
  currentUserId: string;
  onDownloadFile: (file: RoomFile) => void;
  filesById: Map<string, RoomFile>;
}

function getFileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
      return <ImageIcon className="h-4 w-4" />;
    case "zip":
    case "rar":
    case "7z":
      return <FileArchive className="h-4 w-4" />;
    case "mp4":
    case "mov":
    case "avi":
      return <FileVideo className="h-4 w-4" />;
    case "mp3":
    case "wav":
      return <FileAudio className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
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

type MessageGroup = {
  senderId: string;
  senderName: string;
  sentAt: string;
  messages: RoomMessage[];
};

function groupMessages(messages: RoomMessage[]) {
  const groups: MessageGroup[] = [];
  messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1];
    const messageTime = new Date(message.sentAt).getTime();
    const lastTime = lastGroup ? new Date(lastGroup.sentAt).getTime() : 0;
    const sameSender = lastGroup?.senderId === message.senderId;
    const closeInTime = lastGroup ? messageTime - lastTime < 5 * 60 * 1000 : false;

    if (lastGroup && sameSender && closeInTime) {
      lastGroup.messages.push(message);
      lastGroup.sentAt = message.sentAt;
    } else {
      groups.push({
        senderId: message.senderId,
        senderName: message.senderName,
        sentAt: message.sentAt,
        messages: [message],
      });
    }
  });
  return groups;
}

export function MessageList({ messages, currentUserId, onDownloadFile, filesById }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const groups = useMemo(() => groupMessages(messages), [messages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 40;
    if (atBottom) {
      container.scrollTop = container.scrollHeight;
      setShowScrollToBottom(false);
    }
  }, [messages]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 40;
    setShowScrollToBottom(!atBottom);
  };

  return (
    <div className="relative h-[calc(100vh-320px)] overflow-hidden rounded-[var(--radius-lg)] bg-surface border border-border-subtle">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-4 space-y-4"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-text-secondary">
            <p className="text-sm font-semibold text-text-primary">Start the conversation</p>
            <p className="mt-2 text-sm">Send a message to everyone in the room.</p>
          </div>
        ) : (
          groups.map((group) => {
            const isOwn = group.senderId === currentUserId;
            return (
              <div key={`${group.senderId}-${group.sentAt}`} className={cn("space-y-3", isOwn ? "ml-auto max-w-[80%] text-right" : "max-w-[90%]")}> 
                <div className="flex items-center gap-3">
                  {!isOwn ? (
                    <PresenceAvatar name={group.senderName} status="online" size="sm" />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{isOwn ? "You" : group.senderName}</p>
                      <span className="text-[11px] text-text-tertiary">{formatTime(group.sentAt)}</span>
                    </div>
                  </div>
                </div>
                <div className={cn("space-y-2", isOwn ? "items-end" : "items-start")}> 
                  {group.messages.map((message) => {
                    const fileId = message.payload.fileId;
                    const file = fileId ? filesById.get(fileId) : undefined;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-[var(--radius-md)] border border-border-subtle px-4 py-3",
                          isOwn ? "bg-accent-start/10 text-text-primary" : "bg-surface-elevated text-text-secondary",
                        )}
                      >
                        {file ? (
                          <button
                            type="button"
                            onClick={() => onDownloadFile(file)}
                            className="flex w-full items-start gap-3"
                          >
                            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-base text-accent-start">
                              {getFileIcon(file.name)}
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-text-primary">{file.name}</p>
                              <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
                            </div>
                            <Download className="ml-auto h-4 w-4 text-text-secondary" />
                          </button>
                        ) : (
                          <p className={cn("whitespace-pre-wrap break-words text-sm", isOwn ? "text-text-primary" : "text-text-secondary")}>
                            {message.payload.text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
      {showScrollToBottom ? (
        <button
          type="button"
          onClick={() => {
            const container = containerRef.current;
            if (container) container.scrollTop = container.scrollHeight;
            setShowScrollToBottom(false);
          }}
          className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-surface-elevated px-3 py-2 text-xs font-semibold text-text-primary shadow-lg shadow-black/20"
        >
          New messages
        </button>
      ) : null}
    </div>
  );
}
