import { cn } from "@/lib/utils";

interface QuickActionCardProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  accentColor: string;
  onClick?: () => void;
  className?: string;
}

export function QuickActionCard({
  icon,
  label,
  sublabel,
  accentColor,
  onClick,
  className,
}: QuickActionCardProps) {
  // Hex with ~15% opacity: append "26" (dec 38 / 255 ≈ 15%)
  const chipBg = accentColor.startsWith("#")
    ? `${accentColor}26`
    : accentColor;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col w-full text-left p-5 bg-surface border border-border-subtle",
        "transition-all duration-150 hover:brightness-125 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
        "cursor-pointer",
        className,
      )}
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {/* Icon chip */}
      <div
        className="flex items-center justify-center w-10 h-10 mb-3 shrink-0"
        style={{ backgroundColor: chipBg, borderRadius: "var(--radius-sm)" }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>

      <p className="text-sm font-medium text-text-primary leading-tight">
        {label}
      </p>
      <p className="mt-0.5 text-[12px] text-text-tertiary">{sublabel}</p>
    </button>
  );
}
