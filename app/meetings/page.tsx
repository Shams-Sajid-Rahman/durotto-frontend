"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Plus,
  Users,
  Lock,
  Copy,
  Check,
  ArrowRight,
  Clock,
} from "lucide-react";
import { rooms, ApiError, type CreateRoomResponse } from "@/lib/api";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { Modal } from "@/components/shared/Modal";
import { JoinByCodeCard } from "@/components/join/JoinByCodeCard";
import { cn } from "@/lib/utils";

// ── Room card ─────────────────────────────────────────────────────────────────

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void handleCopy(); }}
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
        copied
          ? "border-success/40 text-success bg-success/10"
          : "border-border-subtle text-text-tertiary bg-surface-elevated hover:border-accent-start/60 hover:text-accent-start",
      )}
      aria-label={copied ? "Copied!" : `Copy code ${code}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : code}
    </button>
  );
}

function RoomCard({
  room,
  onJoin,
}: {
  room: CreateRoomResponse;
  onJoin: (id: string) => void;
}) {
  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.round((now.getTime() - d.getTime()) / 3_600_000);
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD === 1) return "Yesterday";
    return `${diffD} days ago`;
  }

  return (
    <div
      className="group bg-surface border border-border-subtle p-5 flex flex-col gap-4 hover:border-accent-start/40 transition-colors cursor-default"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#7C5CFF26" }}
          >
            <Video className="w-5 h-5 text-accent-start" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-text-primary truncate">{room.name}</p>
              {room.is_password_protected && (
                <Lock className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <CopyCodeButton code={room.join_code} />
            </div>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-[12px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {room.participant_count} participant{room.participant_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(room.created_at)}
        </span>
      </div>

      {/* Action */}
      <button
        type="button"
        onClick={() => onJoin(room.id)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-accent-gradient focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start transition-opacity hover:opacity-90"
        style={{ borderRadius: "var(--radius-md)" }}
      >
        Join Room <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function RoomCardSkeleton() {
  return (
    <div
      className="bg-surface border border-border-subtle p-5 space-y-4 animate-pulse"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-border-subtle shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-border-subtle rounded w-1/2" />
          <div className="h-3 bg-border-subtle rounded w-1/4" />
        </div>
      </div>
      <div className="h-3 bg-border-subtle rounded w-1/3" />
      <div className="h-9 bg-border-subtle rounded-[var(--radius-md)]" />
    </div>
  );
}

// ── Meetings page ─────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const router = useRouter();
  const [roomList, setRoomList] = useState<CreateRoomResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    rooms
      .list()
      .then((data) => setRoomList(data as unknown as CreateRoomResponse[]))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load rooms."),
      )
      .finally(() => setLoading(false));
  }, []);

  function handleRoomCreated() {
    setCreateOpen(false);
    // Refresh list
    rooms
      .list()
      .then((data) => setRoomList(data as unknown as CreateRoomResponse[]))
      .catch(() => {});
  }

  return (
    <div className="p-4 md:p-6 max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-text-primary">Meetings</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Create or join a meeting room.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            className="px-4 py-2 text-sm font-medium text-text-primary bg-surface-elevated border border-border-subtle hover:border-accent-start/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            Join with code
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-accent-gradient focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start transition-opacity hover:opacity-90"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            <Plus className="w-4 h-4" /> Create Room
          </button>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger/10 p-4 text-sm text-text-primary mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <RoomCardSkeleton key={i} />)}
        </div>
      ) : roomList.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 py-20 bg-surface border border-border-subtle"
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#7C5CFF26" }}
          >
            <Video className="w-8 h-8 text-accent-start" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">No rooms yet</p>
            <p className="text-sm text-text-secondary mt-1">
              Create your first room or join one with a code.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-accent-gradient focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            <Plus className="w-4 h-4" /> Create Room
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roomList.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onJoin={(id) => router.push(`/room/${id}`)}
            />
          ))}
        </div>
      )}

      <CreateRoomModal
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) void handleRoomCreated();
        }}
      />
      <Modal open={joinOpen} onOpenChange={setJoinOpen} fullScreenMobile maxWidth="max-w-sm">
        <JoinByCodeCard mode="modal" />
      </Modal>
    </div>
  );
}
