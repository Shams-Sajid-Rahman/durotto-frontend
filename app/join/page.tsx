"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { JoinByCodeCard } from "@/components/join/JoinByCodeCard";

export default function JoinPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Route guard — redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 py-12">
      <div
        className="w-full max-w-sm bg-surface border border-border-subtle p-6 sm:p-8"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        <JoinByCodeCard mode="page" />
      </div>
    </div>
  );
}
