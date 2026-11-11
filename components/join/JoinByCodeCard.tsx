"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, Loader2 } from "lucide-react";
import { rooms, ApiError } from "@/lib/api";
import { CodeInput, type CodeInputHandle } from "./CodeInput";
import { FormField } from "@/components/auth/FormField";

interface JoinByCodeCardProps {
  /** "page" shows back chevron and centers content; "modal" omits chevron */
  mode?: "page" | "modal";
}

type Step = "code" | "password";

export function JoinByCodeCard({ mode = "modal" }: JoinByCodeCardProps) {
  const router = useRouter();
  const codeRef = useRef<CodeInputHandle>(null);

  const [step, setStep] = useState<Step>("code");
  const [savedCode, setSavedCode] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function attemptJoin(code: string, pw?: string) {
    if (loading) return;
    setLoading(true);
    setCodeError(null);
    setPasswordError(null);

    try {
      const result = await rooms.joinByCode({ code, password: pw });
      if (result.requiresPassword) {
        setSavedCode(code);
        setStep("password");
      } else {
        router.push(`/room/${result.roomId}`);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Invalid or expired meeting code.";

      if (step === "password") {
        setPasswordError(msg);
      } else {
        setCodeError(msg);
        codeRef.current?.flash();
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCodeComplete(code: string) {
    void attemptJoin(code);
  }

  function handleJoinButton() {
    if (codeValue.length === 6) void attemptJoin(codeValue);
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    void attemptJoin(savedCode, password);
  }

  function handleBackToCode() {
    setStep("code");
    setPassword("");
    setPasswordError(null);
    setCodeError(null);
    setCodeValue("");
  }

  return (
    <div className="flex flex-col">
      {/* Back chevron — page mode only */}
      {mode === "page" && (
        <button
          type="button"
          onClick={() => router.back()}
          className="self-start mb-4 p-1 text-text-secondary hover:text-text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Icon */}
      <div
        className="mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "#22C55E26" }}
      >
        <Users className="w-8 h-8" style={{ color: "#22C55E" }} />
      </div>

      {/* ── Code step ── */}
      {step === "code" && (
        <>
          <h2 className="text-xl font-semibold text-text-primary text-center mb-1">
            Join a Meeting
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            Enter the meeting code provided by the host.
          </p>

          <CodeInput
            ref={codeRef}
            onComplete={handleCodeComplete}
            onValueChange={setCodeValue}
            disabled={loading}
          />

          {codeError && (
            <p className="mt-3 text-sm text-danger text-center" role="alert">
              {codeError}
            </p>
          )}

          <button
            type="button"
            onClick={handleJoinButton}
            disabled={loading || codeValue.length < 6}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-accent-gradient transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Join Meeting
          </button>
        </>
      )}

      {/* ── Password step ── */}
      {step === "password" && (
        <form onSubmit={handlePasswordSubmit} noValidate className="flex flex-col">
          <h2 className="text-xl font-semibold text-text-primary text-center mb-1">
            Password required
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            This meeting is protected. Enter the password to continue.
          </p>

          <FormField
            id="join-password"
            label="Meeting password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError ?? undefined}
            autoFocus
          />

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-accent-gradient transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue
          </button>

          <button
            type="button"
            onClick={handleBackToCode}
            className="mt-4 text-sm text-accent-start hover:text-accent-end transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
          >
            ← Use a different code
          </button>
        </form>
      )}
    </div>
  );
}
