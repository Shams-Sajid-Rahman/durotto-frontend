"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, Lock, MailCheck } from "lucide-react";

import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { auth } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

function ConfirmationView({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-4">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "rgba(124, 92, 255, 0.15)" }}
      >
        <MailCheck className="w-7 h-7 text-accent-start" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Check your email
        </h2>
        <p className="mt-1.5 text-sm text-text-secondary leading-relaxed max-w-[300px]">
          If{" "}
          <span className="text-text-primary font-medium">{email}</span> is
          registered, you&apos;ll receive a password reset link shortly.
        </p>
      </div>
      <p className="text-sm text-text-secondary mt-2">
        Already have a password?{" "}
        <Link
          href="/login"
          className="text-accent-start hover:text-accent-end font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
        >
          Login
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    try {
      await auth.forgotPassword(values.email);
    } catch {
      // Intentionally swallow errors — do not reveal if email exists
    } finally {
      setSubmittedEmail(values.email);
      setSubmitted(true);
    }
  }

  return (
    <AuthCard
      heading={submitted ? "Email sent!" : "Forgot Password?"}
      subheading={
        submitted
          ? "We've sent you a reset link."
          : "No worries! Enter your email and we'll send you a reset link."
      }
    >
      {/* Back link */}
      {!submitted && (
        <Link
          href="/login"
          className="absolute top-6 left-6 flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
          aria-label="Back to login"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
      )}

      {submitted ? (
        <ConfirmationView email={submittedEmail} />
      ) : (
        <>
          {/* Lock icon badge */}
          <div className="flex justify-center mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(124,92,255,0.18) 0%, rgba(61,139,255,0.18) 100%)",
              }}
            >
              <Lock className="w-8 h-8 text-accent-start" />
            </div>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <FormField
              id="email"
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />

            <PrimaryButton type="submit" loading={isSubmitting} className="mt-2">
              Send Reset Link
            </PrimaryButton>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have a password?{" "}
            <Link
              href="/login"
              className="text-accent-start hover:text-accent-end font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
            >
              Login
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
