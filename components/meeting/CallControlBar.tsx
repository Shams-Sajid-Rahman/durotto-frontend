"use client";

import { useMemo } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Wrench,
  Users,
  MoreHorizontal,
  PhoneOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CallControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  chatUnreadCount?: number;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleWhiteboard: () => void;
  onToggleParticipants: () => void;
  onLeave: () => void;
}

function ControlButton({
  label,
  active,
  icon,
  onClick,
  badgeCount,
  danger = false,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  badgeCount?: number;
  danger?: boolean;
}) {
  const color = danger
    ? "bg-[#EF4444] text-white hover:bg-[#DC2626]"
    : active
    ? "bg-accent-start text-black hover:brightness-110"
    : "bg-surface text-text-primary hover:bg-surface-elevated";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-full px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
        color,
      )}
    >
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/10">
        {icon}
        {badgeCount && badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
        {label}
      </span>
    </button>
  );
}

export function CallControlBar({
  micOn,
  cameraOn,
  screenSharing,
  chatUnreadCount = 0,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onToggleWhiteboard,
  onToggleParticipants,
  onLeave,
}: CallControlBarProps) {
  const controls = useMemo(
    () => [
      {
        label: "Mic",
        icon: micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />,
        active: micOn,
        onClick: onToggleMic,
      },
      {
        label: "Camera",
        icon: cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />,
        active: cameraOn,
        onClick: onToggleCamera,
      },
      {
        label: "Screen",
        icon: <Monitor className="w-5 h-5" />,
        active: screenSharing,
        onClick: onToggleScreenShare,
      },
      {
        label: "Chat",
        icon: <MessageSquare className="w-5 h-5" />,
        active: false,
        badgeCount: chatUnreadCount,
        onClick: onToggleChat,
      },
      {
        label: "Whiteboard",
        icon: <Wrench className="w-5 h-5" />,
        active: false,
        onClick: onToggleWhiteboard,
      },
      {
        label: "People",
        icon: <Users className="w-5 h-5" />,
        active: false,
        onClick: onToggleParticipants,
      },
      {
        label: "More",
        icon: <MoreHorizontal className="w-5 h-5" />,
        active: false,
        onClick: () => {},
      },
    ],
    [cameraOn, chatUnreadCount, micOn, onToggleCamera, onToggleChat, onToggleParticipants, onToggleScreenShare, onToggleWhiteboard, onToggleMic, screenSharing],
  );

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 px-4 md:px-6">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 rounded-full border border-border-subtle bg-surface-elevated px-4 py-3 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="hidden gap-3 lg:flex">
          {controls.map((control) => (
            <ControlButton
              key={control.label}
              label={control.label}
              icon={control.icon}
              active={control.active}
              onClick={control.onClick}
            />
          ))}
        </div>

        <div className="grid w-full grid-cols-3 gap-3 lg:hidden">
          {controls.slice(0, 3).map((control) => (
            <ControlButton
              key={control.label}
              label={control.label}
              icon={control.icon}
              active={control.active}
              onClick={control.onClick}
            />
          ))}
        </div>

        <ControlButton
          label="Leave"
          icon={<PhoneOff className="w-5 h-5" />}
          active={false}
          danger
          onClick={onLeave}
        />
      </div>
    </div>
  );
}
