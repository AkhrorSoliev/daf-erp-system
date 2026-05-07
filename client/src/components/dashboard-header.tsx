"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchDropdown } from "@/components/global-search/search-dropdown";
import { BranchSwitcher } from "@/components/branch-switcher";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TashkentClock } from "@/components/tashkent-clock";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { routeLabels } from "@/lib/breadcrumb-routes";

function getParentRoute(pathname: string): { path: string; label: string } | null {
  if (pathname === "/") return null;

  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // Top-level sahifalar uchun → Bosh sahifa ga qaytish
  if (segments.length === 1) {
    return { path: "/", label: routeLabels[""] ?? "Bosh sahifa" };
  }

  // Oxirgi segmentni olib tashlash → parent path
  segments.pop();

  // "profile" segment ni ham o'tkazib yuborish — /students/profile → /students
  if (segments[segments.length - 1] === "profile") {
    segments.pop();
  }

  if (segments.length === 0) return { path: "/", label: routeLabels[""] ?? "Bosh sahifa" };

  const parentPath = "/" + segments.join("/");
  const lastSegment = segments[segments.length - 1];
  const label = routeLabels[lastSegment];
  if (label) return { path: parentPath, label };

  return null;
}

export function DashboardHeader() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const canSearch = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const parentRoute = isMobile ? getParentRoute(pathname) : null;

  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-12 sm:h-14 items-center gap-2 sm:gap-4 px-3 sm:px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <div className="hidden sm:block">
          <BranchSwitcher />
        </div>

        <div className="flex-1 flex justify-center">
          {canSearch && <SearchDropdown />}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <TashkentClock />
          <NotificationBell />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-2">
        {isMobile && parentRoute ? (
          <Link
            href={parentRoute.path}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {parentRoute.label}
          </Link>
        ) : (
          <AppBreadcrumb />
        )}
      </div>
    </header>
  );
}
