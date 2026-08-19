"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LumioBottomNav } from "./lumio/bottom-nav";
import { LumioSideRail } from "./lumio/side-rail";
import { RadioHost } from "./radio/radio-host";
import { RadioMiniPlayer } from "./radio/radio-mini-player";
import { RadioNowPlaying } from "./radio/radio-now-playing";
import { useRadio } from "./lib/radio-store";
import { useSidebar, CONTENT_INSET } from "./lib/sidebar-store";
import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// Responsive Lumio app shell. Mobile (< md) gets the native-app feel: a centered
// single column and a floating bottom-nav pill. Tablet and desktop (>= md) swap
// the bottom nav for a persistent left side rail whose width the student
// controls — 72px icons or 240px with labels (see `sidebar-store`). Both nav
// forms are never on screen at once: two ways to reach the same six screens on
// one viewport is noise, not choice. The `.lumio` scope + fonts are applied by
// the portal route layout that renders this.
export function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  // Drives the extra bottom padding that keeps the last row of a screen clear
  // of the docked player.
  const radioActive = useRadio((s) => s.stationId !== null);
  const sidebarMode = useSidebar((s) => s.mode);
  const resolveSidebar = useSidebar((s) => s.resolve);

  // Turns the CSS-only `auto` width into the student's stored choice — or, if
  // they have never picked, into the one their screen implies.
  useEffect(() => {
    resolveSidebar();
  }, [resolveSidebar]);

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
      {/* Tablet + desktop navigation rail */}
      <LumioSideRail className="hidden md:flex" />

      {/* Content column — padded left by whatever the rail currently occupies */}
      <div
        className={cn(
          "transition-[padding] duration-200 ease-out",
          CONTENT_INSET[sidebarMode],
        )}
      >
        <main
          className={cn(
            "mx-auto w-full max-w-[560px] px-4 pb-32 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-5 md:max-w-[720px] md:px-8 md:py-8 md:pb-12 lg:max-w-[980px]",
            // The dock overlays the page; without this the last row of a long
            // screen sits underneath it and can't be tapped.
            radioActive && "pb-48 md:pb-28",
          )}
        >
          {children}
        </main>
      </div>

      {/* Floating bottom nav — mobile only; the rail takes over from md up */}
      <LumioBottomNav className="md:hidden" />

      {/*
        Radio lives in the shell, not in a page. The audio element itself is a
        module singleton (see radio-store), so navigating between portal screens
        never interrupts the stream; these three only render its controls.
      */}
      <RadioHost />
      <RadioMiniPlayer />
      <RadioNowPlaying />
    </div>
  );
}
