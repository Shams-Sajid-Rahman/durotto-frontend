"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface CodeInputHandle {
  /** Flash danger border for 600 ms, clear values, and refocus first box */
  flash: () => void;
}

interface CodeInputProps {
  onComplete: (code: string) => void;
  /** Called on every keystroke with the current (possibly partial) value */
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export const CodeInput = forwardRef<CodeInputHandle, CodeInputProps>(
  function CodeInput({ onComplete, onValueChange, disabled }, ref) {
    const [values, setValues] = useState<string[]>(Array(6).fill(""));
    const [hasError, setHasError] = useState(false);
    const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

    const focusBox = useCallback((idx: number) => {
      boxRefs.current[Math.max(0, Math.min(5, idx))]?.focus();
    }, []);

    useImperativeHandle(ref, () => ({
      flash() {
        setHasError(true);
        const cleared = Array(6).fill("") as string[];
        setValues(cleared);
        onValueChange?.("");
        setTimeout(() => {
          setHasError(false);
          focusBox(0);
        }, 600);
      },
    }));

    function handleChange(idx: number, raw: string) {
      const char = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
      if (!char) return;
      const next = [...values];
      next[idx] = char;
      setValues(next);
      onValueChange?.(next.join(""));
      if (idx < 5) {
        focusBox(idx + 1);
      }
      if (next.every(Boolean)) {
        onComplete(next.join(""));
      }
    }

    function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Backspace") {
        e.preventDefault();
        if (values[idx]) {
          const next = [...values];
          next[idx] = "";
          setValues(next);
          onValueChange?.(next.join(""));
        } else if (idx > 0) {
          const next = [...values];
          next[idx - 1] = "";
          setValues(next);
          onValueChange?.(next.join(""));
          focusBox(idx - 1);
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusBox(idx - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        focusBox(idx + 1);
        return;
      }
      if (e.key === "Enter") {
        if (values.every(Boolean)) onComplete(values.join(""));
      }
    }

    function handlePaste(e: React.ClipboardEvent) {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      if (!pasted) return;
      const next: string[] = Array(6).fill("");
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      setValues(next);
      onValueChange?.(next.join(""));
      const focusIdx = Math.min(pasted.length, 5);
      focusBox(focusIdx);
      if (pasted.length >= 6) onComplete(next.join(""));
    }

    return (
      <div className="flex justify-center gap-2 sm:gap-3">
        {values.map((v, i) => (
          <input
            key={i}
            ref={(el) => { boxRefs.current[i] = el; }}
            type="text"
            inputMode="text"
            maxLength={2}
            value={v}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "w-10 h-14 sm:w-12 sm:h-14 text-center font-mono text-xl font-semibold text-text-primary",
              "bg-surface-elevated border transition-colors outline-none",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              hasError
                ? "border-danger"
                : "border-border-subtle focus:border-accent-start focus:ring-2 focus:ring-accent-start/20",
            )}
            style={{ borderRadius: "var(--radius-md)" }}
            aria-label={`Code character ${i + 1} of 6`}
          />
        ))}
      </div>
    );
  },
);
