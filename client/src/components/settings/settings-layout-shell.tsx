"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { SettingsSidebar } from "./settings-sidebar";
import { SettingsMobileMenu } from "./settings-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Checks if the current path is a detail page (has an ID segment).
 * List pages: /settings/courses, /settings/rooms
 * Detail pages: /settings/courses/1, /settings/rooms/5
 */
function isDetailPage(pathname: string): boolean {
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  return segments.length > 2;
}

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const isTeacherOnly =
    (user?.roles.some((r) => r.id === 4) &&
      !user?.roles.some((r) => [1, 2, 3].includes(r.id))) ??
    false;
  const isAdminOnly =
    (user?.roles.some((r) => r.id === 3) &&
      !user?.roles.some((r) => [1, 2].includes(r.id))) ??
    false;
  const isAdminRestricted =
    pathname.startsWith("/settings/employees") ||
    pathname.startsWith("/settings/branches");

  useEffect(() => {
    if (isTeacherOnly) {
      router.replace("/");
    } else if (isAdminOnly && isAdminRestricted) {
      router.replace("/settings");
    }
  }, [isTeacherOnly, isAdminOnly, isAdminRestricted, router]);

  if (isTeacherOnly || (isAdminOnly && isAdminRestricted)) {
    return null;
  }

  const isDetail = isDetailPage(pathname);
  const isGeneral = pathname.startsWith("/settings/general");

  // Detail pages va desktopda general → sidebar/layout yo'q
  // Mobileda general o'zi back button boshqaradi
  if (isDetail || (isGeneral && !isMobile) || (isGeneral && isMobile)) {
    return <>{children}</>;
  }

  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";

  // Mobile layout: drill-down pattern
  if (isMobile) {
    // /settings root → menu ro'yxati
    if (isSettingsRoot) {
      return (
        <div className="space-y-4">
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight">
              Sozlamalar
            </h1>
            <p className="text-sm text-muted-foreground">
              Tizim sozlamalari va boshqaruv
            </p>
          </div>
          <SettingsMobileMenu />
        </div>
      );
    }

    // Sub-page → content only (back button is in DashboardHeader)
    return (
      <div className="space-y-4">
        {children}
      </div>
    );
  }

  // Desktop layout: sidebar + content
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Sozlamalar
        </h1>
        <p className="text-muted-foreground">
          Tizim sozlamalari va boshqaruv
        </p>
      </div>
      <Separator />
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
