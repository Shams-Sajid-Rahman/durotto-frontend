import { cn } from "@/lib/utils";

interface AuthCardProps {
  heading: string;
  subheading: string;
  children: React.ReactNode;
  className?: string;
}

function DurottoLogo() {
  return (
    <div className="flex flex-col items-center gap-2 mb-8">
      {/* Gradient diamond icon */}
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div
          className="w-9 h-9 rotate-45 rounded-[6px]"
          style={{
            background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rotate-45 rounded-[2px] bg-white/20" />
        </div>
      </div>
      {/* Wordmark */}
      <span
        className="text-xl font-semibold tracking-tight"
        style={{
          background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Durotto
      </span>
    </div>
  );
}

export function AuthCard({
  heading,
  subheading,
  children,
  className,
}: AuthCardProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-base px-4 py-12">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <DurottoLogo />

        <div
          className={cn(
            "relative w-full bg-surface border border-border-subtle rounded-xl p-8",
            className,
          )}
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold text-text-primary leading-tight">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">{subheading}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
