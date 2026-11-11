import { cn } from "@/lib/utils";

interface StatCardProps {
  value: number | string;
  label: string;
  className?: string;
}

export function StatCard({ value, label, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-4 bg-surface border border-border-subtle",
        className,
      )}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <span className="text-2xl font-semibold text-text-primary leading-tight">
        {value}
      </span>
      <span className="text-[12px] text-text-tertiary mt-1 leading-tight">
        {label}
      </span>
    </div>
  );
}

// Skeleton for loading state
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-4 bg-surface border border-border-subtle animate-pulse gap-2",
        className,
      )}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <div className="h-7 w-12 rounded bg-border-subtle" />
      <div className="h-3 w-20 rounded bg-border-subtle" />
    </div>
  );
}
