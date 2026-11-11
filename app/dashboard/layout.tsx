"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <div className="flex flex-col items-center gap-4">
        {/* Animated gradient diamond */}
        <div className="relative w-12 h-12 flex items-center justify-center animate-pulse">
          <div
            className="w-9 h-9 rotate-45 rounded-[6px]"
            style={{
              background: "linear-gradient(135deg, #7C5CFF 0%, #3D8BFF 100%)",
            }}
          />
        </div>
        <p className="text-sm text-text-tertiary">Loading…</p>
      </div>
    </div>
  );
}

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show spinner while checking localStorage
  if (isLoading) return <LoadingScreen />;

  // Render nothing while redirect is in flight
  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      {/* Main column — offset by sidebar on desktop, padded for bottom nav on mobile */}
      <div className="flex flex-col flex-1 min-h-screen md:ml-60 pb-16 md:pb-0">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export default DashboardLayout;
