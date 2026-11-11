"use client";

import { useMemo } from "react";
import { VideoTile } from "@/components/meeting/VideoTile";
import type { Participant } from "@/lib/webrtc/usePeerConnections";

interface VideoGridProps {
  localStream: MediaStream | null;
  isLocalCameraOff: boolean;
  localUserId: string;
  localMuted: boolean;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  connectionStates: Map<string, "connecting" | "connected" | "failed">;
  screenShareUserId?: string | null;
}

export function VideoGrid({
  localStream,
  isLocalCameraOff,
  localUserId,
  localMuted,
  remoteStreams,
  participants,
  connectionStates,
  screenShareUserId,
}: VideoGridProps) {
  const tiles = useMemo(
    () =>
      participants.map((participant) => {
        const isLocal = participant.id === localUserId;
        const stream = isLocal ? localStream ?? undefined : remoteStreams.get(participant.id);
        const state = isLocal ? "connected" : connectionStates.get(participant.id) ?? "connecting";
        return {
          id: participant.id,
          element: (
            <VideoTile
              key={participant.id}
              stream={stream}
              name={participant.name}
              isLocal={isLocal}
              isMuted={isLocal ? localMuted : false}
              isCameraOff={isLocal ? isLocalCameraOff : stream == null}
              isScreenSharing={screenShareUserId === participant.id}
              connectionState={state}
            />
          ),
        };
      }),
    [participants, localStream, localUserId, localMuted, isLocalCameraOff, remoteStreams, connectionStates, screenShareUserId],
  );

  const screenShareTile = screenShareUserId ? tiles.find((tile) => tile.id === screenShareUserId) : null;
  const otherTiles = tiles.filter((tile) => tile.id !== screenShareUserId);

  return (
    <div className="space-y-4">
      {screenShareTile ? (
        <div className="grid gap-4 lg:grid-cols-[1.65fr_0.9fr] xl:grid-cols-[2fr_0.95fr]">
          <div className="min-h-[360px]">{screenShareTile.element}</div>
          <div className="grid gap-4">{otherTiles.map((tile) => tile.element)}</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => tile.element)}
        </div>
      )}
    </div>
  );
}
