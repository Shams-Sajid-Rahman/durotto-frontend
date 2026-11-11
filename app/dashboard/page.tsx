"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Video,
  Pencil,
  Upload,
  UserCheck,
  FileUp,
  AtSign,
  Info,
  ArrowRight,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { QuickActionCard } from "@/components/shared/QuickActionCard";
import { MeetingListItem } from "@/components/shared/MeetingListItem";
import { ActivityListItem, type ActivityType } from "@/components/shared/ActivityListItem";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import { Modal } from "@/components/shared/Modal";
import { JoinByCodeCard } from "@/components/join/JoinByCodeCard";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import {
  notificationsApi,
  rooms,
  users,
  type AppNotification,
  type NotificationType,
  type OnlineUser,
  type Room,
} from "@/lib/api";

// ── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso?: string) {
  if (!iso) return "";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} hr ago`;
  const diffD = Math.round(diffH / 24);
  return diffD === 1 ? "yesterday" : `${diffD} days ago`;
}

const ACTIVITY_META: Record<NotificationType, { icon: React.ReactNode; type: ActivityType }> = {
  join: { icon: <UserCheck className="w-4 h-4" />, type: "join" },
  upload: { icon: <FileUp className="w-4 h-4" />, type: "upload" },
  mention: { icon: <AtSign className="w-4 h-4" />, type: "whiteboard" },
  system: { icon: <Info className="w-4 h-4" />, type: "default" },
};

// ── Sub-sections ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-surface border border-border-subtle p-5"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const greeting = getGreeting(new Date().getHours());
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [myRooms, setMyRooms] = useState<Room[] | null>(null);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [activity, setActivity] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      rooms.list().then((r) => active && setMyRooms(r)).catch(() => active && setMyRooms([]));
      users.online().then((o) => active && setOnline(o)).catch(() => {});
      notificationsApi
        .list()
        .then((n) => active && setActivity(n.slice(0, 5)))
        .catch(() => active && setActivity([]));
    };
    load();
    const timer = setInterval(() => {
      users.online().then((o) => active && setOnline(o)).catch(() => {});
    }, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  function handleCreateRoom() {
    setCreateOpen(true);
  }

  function handleJoinMeeting() {
    setJoinOpen(true);
  }

  function handleWhiteboard() {
    router.push("/whiteboard");
  }

  function handleUploadFile() {
    router.push("/files");
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1280px]">
      {/* ── Greeting ── */}
      <div>
        <h1 className="text-[22px] font-semibold text-text-primary leading-tight">
          {greeting}, {user?.name ?? "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ready to connect and collaborate
        </p>
      </div>

      {/* ── Quick actions ── */}
      <section aria-label="Quick actions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionCard
            icon={<Plus className="w-5 h-5" />}
            label="Create Room"
            sublabel="Start a new meeting"
            accentColor="#7C5CFF"
            onClick={handleCreateRoom}
          />
          <QuickActionCard
            icon={<Video className="w-5 h-5" />}
            label="Join Meeting"
            sublabel="Enter with a code"
            accentColor="#22C55E"
            onClick={handleJoinMeeting}
          />
          <QuickActionCard
            icon={<Pencil className="w-5 h-5" />}
            label="Whiteboard"
            sublabel="Collaborate visually"
            accentColor="#06B6D4"
            onClick={handleWhiteboard}
          />
          <QuickActionCard
            icon={<Upload className="w-5 h-5" />}
            label="Upload File"
            sublabel="Share documents"
            accentColor="#F59E0B"
            onClick={handleUploadFile}
          />
        </div>
      </section>

      {/* ── Two-column section ── */}
      <section
        aria-label="Meetings and online users"
        className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"
      >
        {/* Upcoming meetings */}
        <SectionCard
          title="Your Rooms"
          action={
            <a
              href="/meetings"
              className="flex items-center gap-1 text-[12px] font-medium text-accent-start hover:text-accent-end transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </a>
          }
        >
          {myRooms === null ? (
            <p className="text-sm text-text-tertiary py-4 text-center">Loading…</p>
          ) : myRooms.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">
              No rooms yet — create one or join with a code.
            </p>
          ) : (
            <div>
              {myRooms.slice(0, 4).map((room) => (
                <MeetingListItem
                  key={room.id}
                  title={room.name}
                  time={
                    room.participant_count
                      ? `${room.participant_count} in the call now`
                      : `Created ${relativeTime(room.created_at)}`
                  }
                  type={room.participant_count ? "video" : "meeting"}
                  onJoin={() => router.push(`/room/${room.id}`)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Online users */}
        <SectionCard title={`In calls now (${online.length})`}>
          {online.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">
              Nobody from your rooms is in a call right now.
            </p>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {online.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => router.push(`/room/${u.roomId}`)}
                  className="flex w-full items-center gap-2.5 py-1.5 px-1 text-left hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
                  style={{ borderRadius: "var(--radius-sm)" }}
                >
                  <PresenceAvatar name={u.name} status="online" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate leading-tight">{u.name}</p>
                    <p className="text-[11px] leading-tight text-success truncate">in {u.roomName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      {/* ── Recent activity ── */}
      <section aria-label="Recent activity">
        <SectionCard title="Recent Activity">
          {activity === null ? (
            <p className="text-sm text-text-tertiary py-4 text-center">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">No activity yet.</p>
          ) : (
            activity.map((item) => (
              <ActivityListItem
                key={item.id}
                icon={ACTIVITY_META[item.type]?.icon ?? <Info className="w-4 h-4" />}
                text={item.body}
                timestamp={relativeTime(item.createdAt)}
                type={ACTIVITY_META[item.type]?.type ?? "default"}
              />
            ))
          )}
        </SectionCard>
      </section>

      {/* ── Join by code modal ── */}
      <Modal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        fullScreenMobile
        maxWidth="max-w-sm"
      >
        <JoinByCodeCard mode="modal" />
      </Modal>

      {/* ── Create room modal ── */}
      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
