"use client";

import { useEffect, useRef } from "react";
import { MicOff, VideoOff, Monitor } from "lucide-react";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import { cn } from "@/lib/utils";

interface VideoTileProps {
  stream?: MediaStream;
  name: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isScreenSharing?: boolean;
  connectionState?: "connecting" | "connected" | "failed";
}

export function VideoTile({
  stream,
  name,
  isLocal = false,
  isMuted = false,
  isCameraOff = false,
  isScreenSharing = false,
  connectionState = "connected",
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isConnecting = connectionState === "connecting";
  const borderClasses = isLocal
    ? "border border-accent-start"
    : "border border-border-subtle";

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface-elevated border shadow-sm",
        "rounded-[var(--radius-lg)]",
        borderClasses,
        isConnecting && "animate-pulse border-accent-start/50",
      )}
      style={{ minHeight: 180 }}
    >
      {isCameraOff ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-6 text-center text-text-secondary">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-border-subtle">
            <PresenceAvatar name={name} status="offline" size="lg" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{name}</p>
            <p className="text-xs text-text-tertiary">Camera is off</p>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="h-full w-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      <div className="absolute left-4 bottom-4 flex flex-wrap items-center gap-2 rounded-full bg-surface-elevated/90 px-3 py-1 text-[12px] text-text-primary backdrop-blur-sm">
        <span className="font-semibold">{name}</span>
        {isMuted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#EF44441A] px-2 py-1 text-danger">
            <MicOff className="w-3.5 h-3.5" /> muted
          </span>
        )}
        {isScreenSharing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#7C5CFF29] px-2 py-1 text-[11px] text-accent-start">
            <Monitor className="w-3.5 h-3.5" /> sharing
          </span>
        )}
      </div>

      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex flex-col items-center gap-2 rounded-full border border-white/20 bg-black/50 px-4 py-3 text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent-start" />
            <span className="text-xs text-text-primary">Connecting...</span>
          </div>
        </div>
      )}

      {!isCameraOff && stream == null && !isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface text-text-secondary">
          <div className="text-center">
            <VideoOff className="mx-auto mb-2 h-5 w-5" />
            <p className="text-sm">Waiting for video</p>
          </div>
        </div>
      )}
    </div>
  );
}
