import { Video, Mic, Users } from "lucide-react";

export type MeetingType = "video" | "audio" | "meeting";

interface MeetingListItemProps {
  title: string;
  time: string;
  type?: MeetingType;
  onJoin?: () => void;
}

const TYPE_ICONS: Record<MeetingType, React.ReactNode> = {
  video: <Video className="w-4 h-4" />,
  audio: <Mic className="w-4 h-4" />,
  meeting: <Users className="w-4 h-4" />,
};

export function MeetingListItem({
  title,
  time,
  type = "video",
  onJoin,
}: MeetingListItemProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-subtle last:border-0">
      {/* Icon chip */}
      <div
        className="w-9 h-9 flex items-center justify-center shrink-0 text-accent-start"
        style={{
          backgroundColor: "#7C5CFF26",
          borderRadius: "var(--radius-sm)",
        }}
      >
        {TYPE_ICONS[type]}
      </div>

      {/* Title + time */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        <p className="text-[12px] text-text-tertiary mt-0.5">{time}</p>
      </div>

      {/* Join button */}
      <button
        type="button"
        onClick={onJoin}
        className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-accent-gradient
          transition-all duration-150 hover:brightness-110
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
        style={{ borderRadius: "var(--radius-sm)" }}
      >
        Join
      </button>
    </div>
  );
}
