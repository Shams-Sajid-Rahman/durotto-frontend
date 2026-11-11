import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export function PrimaryButton({
  loading,
  disabled,
  children,
  className,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-center gap-2",
        "px-4 py-2.5 text-sm font-semibold text-white",
        "bg-accent-gradient rounded-md",
        "transition-all duration-150",
        "hover:brightness-110 active:brightness-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100",
        className,
      )}
      style={{ borderRadius: "var(--radius-md)" }}
      aria-busy={loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
