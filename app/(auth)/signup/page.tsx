"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { SocialDivider, SocialRow } from "@/components/auth/SocialButton";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

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
      await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError("An account with this email already exists.");
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Something went wrong. Please try again later.");
      }
    }
  }

  return (
    <AuthCard
      heading="Create your account"
      subheading="Let's get you started"
    >
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
          id="name"
          label="Full name"
          type="text"
          placeholder="Alex Johnson"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />

        <FormField
          id="email"
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="flex flex-col gap-1">
          <FormField
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          {!errors.password && (
            <p className="text-[12px] text-text-tertiary">
              Must be at least 8 characters
            </p>
          )}
        </div>

        <PrimaryButton type="submit" loading={isSubmitting} className="mt-2">
          Create Account
        </PrimaryButton>
      </form>

      <SocialDivider />
      <SocialRow />

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-accent-start hover:text-accent-end font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
        >
          Login
        </Link>
      </p>
    </AuthCard>
  );
}
