"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Check } from "lucide-react";
import { adminApi, setAdminSession } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.login(email.trim(), password);
      setAdminSession(res.access_token, res.user, remember);
      router.push("/admin");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base px-4">
      <div
        className="w-full max-w-sm bg-surface border border-border-subtle p-8"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: "#7C5CFF26" }}
          >
            <ShieldCheck className="w-7 h-7 text-accent-start" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Admin Portal</h1>
          <p className="text-sm text-text-secondary mt-1">
            Sign in with an administrator account.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 px-3 py-2.5 bg-danger/10 border border-danger/30 text-danger text-sm"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-text-primary mb-1.5">
              Email address
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@gmail.com"
              className="w-full px-3 py-2.5 text-sm bg-surface-elevated border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-start/60"
              style={{ borderRadius: "var(--radius-md)" }}
              required
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-text-primary mb-1.5">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 text-sm bg-surface-elevated border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-start/60"
              style={{ borderRadius: "var(--radius-md)" }}
              required
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
            />
            <span
              className="flex h-4 w-4 items-center justify-center rounded border border-border-subtle bg-surface-elevated transition-colors peer-checked:border-transparent peer-checked:bg-accent-gradient peer-focus-visible:ring-2 peer-focus-visible:ring-accent-start"
              aria-hidden
            >
              {remember && <Check className="h-3 w-3 text-white" />}
            </span>
            Remember me
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-accent-gradient transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          Default admin — admin@gmail.com / admin123
        </p>
      </div>
    </div>
  );
}
