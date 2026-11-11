"use client";

import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import type { Participant } from "@/lib/webrtc/usePeerConnections";

interface ParticipantsPanelProps {
  participants: Participant[];
}

export function ParticipantsPanel({ participants }: ParticipantsPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">Participants in the room</p>
      <div className="space-y-3">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-3"
          >
            <PresenceAvatar name={participant.name} status="online" size="md" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{participant.name}</p>
              <p className="text-xs text-text-secondary">{participant.id === "self" ? "You" : "Online"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
