"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, User, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { SocialDivider, SocialRow } from "@/components/auth/SocialButton";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { adminApi, setAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;
type Mode = "user" | "admin";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("user");
  const [serverError, setServerError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      if (mode === "admin") {
        const res = await adminApi.login(values.email, values.password);
        setAdminSession(res.access_token, res.user, remember);
        router.push("/admin");
        return;
      }
      await login({ email: values.email, password: values.password }, remember);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        // 403 = suspended account, 429 = too many attempts: show the reason.
        setServerError(
          err.status !== 401
            ? err.message
            : mode === "admin"
              ? "Invalid admin credentials. Please try again."
              : "Invalid email or password. Please try again.",
        );
      } else {
        setServerError("Something went wrong. Please try again later.");
      }
    }
  }

  const isAdmin = mode === "admin";

  return (
    <AuthCard
      heading={isAdmin ? "Admin sign in 🛡️" : "Welcome back 👋"}
      subheading={
        isAdmin
          ? "Sign in with an administrator account"
          : "Login to continue to your account"
      }
    >
      {/* User / Admin toggle */}
      <div
        className="mb-5 grid grid-cols-2 gap-1 p-1 bg-surface-elevated border border-border-subtle"
        style={{ borderRadius: "var(--radius-md)" }}
        role="tablist"
        aria-label="Login type"
      >
        {(
          [
            { key: "user", label: "User", icon: User },
            { key: "admin", label: "Admin", icon: ShieldCheck },
          ] as const
        ).map(({ key, label, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMode(key);
                setServerError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start",
                active
                  ? "bg-accent-gradient text-white"
                  : "text-text-secondary hover:text-text-primary",
              )}
              style={{ borderRadius: "var(--radius-sm)" }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {serverError && (
        <div
          role="alert"
          className="mb-4 px-3 py-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-sm"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField
          id="email"
          label="Email address"
          type="email"
          placeholder={isAdmin ? "admin@gmail.com" : "you@example.com"}
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={errors.password?.message}
          labelRight={
            !isAdmin ? (
              <Link
                href="/forgot-password"
                className="text-accent-start hover:text-accent-end transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
              >
                Forgot password?
              </Link>
            ) : undefined
          }
          {...register("password")}
        />

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

        <PrimaryButton type="submit" loading={isSubmitting} className="mt-2">
          {isAdmin ? "Sign in to Admin" : "Login"}
        </PrimaryButton>
      </form>

      {isAdmin ? (
        <p className="mt-6 text-center text-xs text-text-tertiary">
          Administrator access only. Accounts are managed from the admin dashboard.
        </p>
      ) : (
        <>
          <SocialDivider />
          <SocialRow />

          <p className="mt-6 text-center text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-accent-start hover:text-accent-end font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
            >
              Sign up
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
