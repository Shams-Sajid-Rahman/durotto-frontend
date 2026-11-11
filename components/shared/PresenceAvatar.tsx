import { cn } from "@/lib/utils";

export type PresenceStatus = "online" | "away" | "offline";

interface PresenceAvatarProps {
  src?: string;
  name: string;
  status: PresenceStatus;
  size?: "sm" | "md" | "lg";
  /** Override the pixel dimension when preset sizes aren't enough */
  customSize?: number;
  className?: string;
}

const SIZES = { sm: 28, md: 36, lg: 44 } as const;
const DOT_SIZES = { sm: 8, md: 10, lg: 12 } as const;
const STATUS_COLORS: Record<PresenceStatus, string> = {
  online: "#22C55E",
  away: "#F59E0B",
  offline: "#6B7088",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function PresenceAvatar({
  src,
  name,
  status,
  size = "md",
  customSize,
  className,
}: PresenceAvatarProps) {
  const dim = customSize ?? SIZES[size];
  const dotDim = customSize ? Math.round(customSize * 0.2) : DOT_SIZES[size];
  const initials = getInitials(name);
  const dotColor = STATUS_COLORS[status];

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: dim, height: dim }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold select-none"
          style={{
            background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
            fontSize: Math.round(dim * 0.36),
          }}
          aria-label={name}
        >
          {initials}
        </div>
      )}

      <span
        className="absolute bottom-0 right-0 rounded-full"
        style={{
          width: dotDim,
          height: dotDim,
          backgroundColor: dotColor,
          boxShadow: "0 0 0 2px #0B0B14",
        }}
        aria-label={`Status: ${status}`}
      />
    </div>
  );
}
