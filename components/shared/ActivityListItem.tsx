export type ActivityType = "join" | "upload" | "whiteboard" | "default";

interface ActivityListItemProps {
  icon: React.ReactNode;
  text: string;
  timestamp: string;
  type?: ActivityType;
}

const TYPE_COLORS: Record<ActivityType, string> = {
  join: "#3D8BFF",
  upload: "#22C55E",
  whiteboard: "#7C5CFF",
  default: "#6B7088",
};

export function ActivityListItem({
  icon,
  text,
  timestamp,
  type = "default",
}: ActivityListItemProps) {
  const color = TYPE_COLORS[type];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-subtle last:border-0">
      {/* Icon circle */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}26`, color }}
      >
        {icon}
      </div>

      <p className="flex-1 text-sm text-text-secondary leading-snug">{text}</p>

      <span className="text-[12px] text-text-tertiary shrink-0 ml-2">
        {timestamp}
      </span>
    </div>
  );
}
