"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LumioBottomNav } from "./lumio/bottom-nav";
import { LumioSideRail } from "./lumio/side-rail";
import { CircleNotch } from "@phosphor-icons/react";

// Responsive Lumio app shell. Mobile + tablet (< lg) get the native-app feel: a
// centered single column, a slim glass top bar, and a floating bottom-nav pill.
// Desktop (>= lg) swaps the bottom nav for a persistent left side rail and a
// wider content column. The `.lumio` scope + fonts are applied by the portal
// route layout that renders this.
export function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const router = useRouter();

  const isStudent = user?.roles?.some((r) => r.id === 6) ?? false;

  useEffect(() => {
    if (user && !isStudent) {
      router.replace("/");
    }
  }, [user, isStudent, router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <CircleNotch className="size-8 animate-spin text-coral-500" weight="bold" />
      </div>
    );
  }

  if (!isStudent) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop-only navigation rail */}
      <LumioSideRail className="hidden lg:flex" />

      {/* Content column — padded left for the rail on desktop */}
      <div className="lg:pl-[240px]">
        <main className="mx-auto w-full max-w-[560px] px-4 pb-32 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-5 lg:max-w-[980px] lg:px-8 lg:py-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Floating bottom nav — mobile + tablet */}
      <LumioBottomNav className="lg:hidden" />
    </div>
  );
}
