"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  labelRight?: React.ReactNode;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  function FormField(
    { label, error, labelRight, className, type, ...props },
    ref,
  ) {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="flex flex-col gap-1.5">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <label
            htmlFor={props.id}
            className="text-[13px] font-medium text-text-secondary"
          >
            {label}
          </label>
          {labelRight && (
            <span className="text-[13px]">{labelRight}</span>
          )}
        </div>

        {/* Input wrapper */}
        <div className="relative">
          <input
            ref={ref}
            type={resolvedType}
            className={cn(
              "w-full bg-surface-elevated border border-border-subtle rounded-md",
              "px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary",
              "transition-colors duration-150",
              "focus:outline-none focus:border-accent-start focus:ring-1 focus:ring-accent-start/40",
              isPassword && "pr-10",
              error && "border-danger focus:border-danger focus:ring-danger/30",
              className,
            )}
            style={{ borderRadius: "var(--radius-md)" }}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={0}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-[12px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
