"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Inline Toggle ─────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-base",
      )}
      style={
        checked
          ? { background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)" }
          : { backgroundColor: "#26263A" }
      }
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

// ── Inline StyledSelect ───────────────────────────────────────────────────────

interface StyledSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}

export function StyledSelect({ value, onChange, options, label }: StyledSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "bg-surface-elevated border border-border-subtle text-sm text-text-primary",
        "px-3 py-1.5 rounded-md cursor-pointer shrink-0",
        "focus:outline-none focus:border-accent-start focus:ring-1 focus:ring-accent-start/30",
      )}
      style={{ borderRadius: "var(--radius-sm)" }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ backgroundColor: "#1C1C2A" }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ── SettingsListRow ───────────────────────────────────────────────────────────

type BaseRow = {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  className?: string;
};

type NavRow = BaseRow & {
  variant: "nav";
  onClick?: () => void;
  href?: string;
};

type ToggleRow = BaseRow & {
  variant: "toggle";
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
};

type SelectRow = BaseRow & {
  variant: "select";
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
};

export type SettingsListRowProps = NavRow | ToggleRow | SelectRow;

export function SettingsListRow(props: SettingsListRowProps) {
  const { icon, label, sublabel, className } = props;

  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 bg-surface",
        "border-b border-border-subtle last:border-0",
        props.variant === "nav" &&
          "cursor-pointer hover:bg-surface-elevated transition-colors",
        className,
      )}
    >
      {icon && (
        <span className="text-text-secondary shrink-0 w-5 flex items-center justify-center">
          {icon}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {sublabel && (
          <p className="text-[12px] text-text-tertiary mt-0.5">{sublabel}</p>
        )}
      </div>

      {props.variant === "nav" && (
        <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
      )}

      {props.variant === "toggle" && (
        <Toggle
          checked={props.checked}
          onChange={props.onCheckedChange}
          label={label}
        />
      )}

      {props.variant === "select" && (
        <StyledSelect
          value={props.value}
          onChange={props.onChange}
          options={props.options}
          label={label}
        />
      )}
    </div>
  );

  // Nav rows are interactive: render as a Link when an href is given,
  // otherwise as a button that fires onClick. Toggle/select rows are static
  // containers (their control handles interaction).
  if (props.variant === "nav") {
    if (props.href) {
      return (
        <Link
          href={props.href}
          onClick={props.onClick}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-inset"
        >
          {inner}
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={props.onClick}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start focus-visible:ring-inset"
      >
        {inner}
      </button>
    );
  }

  return inner;
}

// ── SettingsGroup (outer container for rows) ──────────────────────────────────

export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden bg-surface-elevated", className)}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      {children}
    </div>
  );
}
