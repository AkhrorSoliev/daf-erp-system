"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SearchDropdown } from "@/components/global-search/search-dropdown";
import { BranchSwitcher } from "@/components/branch-switcher";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { HeaderUserMenu } from "@/components/header-user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushPermissionPrompt } from "@/components/notifications/push-permission-prompt";
import { QollanmaYordamTugmasi } from "@/components/qollanma/qollanma-yordam-tugmasi";
import { TashkentClock } from "@/components/tashkent-clock";
import { HeaderTaskButton } from "@/components/tasks/header-task-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { isTeacherOnly } from "@/lib/teacher-only";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { routeLabels } from "@/lib/breadcrumb-routes";

function getParentRoute(
  pathname: string,
  teacherOnly: boolean,
): { path: string; label: string } | null {
  if (pathname === "/") return null;

  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // Top-level sahifalar uchun → Bosh sahifa ga qaytish. Ustozda «Bosh sahifa»
  // — o'zining boshqa bir sahifasi, shuning uchun unga qaytish havolasi yo'q.
  if (segments.length === 1) {
    if (teacherOnly) return null;
    return { path: "/", label: routeLabels[""] ?? msg("Bosh sahifa") };
  }

  // Oxirgi segmentni olib tashlash → parent path
  segments.pop();

  // "profile" segment ni ham o'tkazib yuborish — /students/profile → /students
  if (segments[segments.length - 1] === "profile") {
    segments.pop();
  }

  if (segments.length === 0) return { path: "/", label: routeLabels[""] ?? msg("Bosh sahifa") };

  const parentPath = "/" + segments.join("/");
  const lastSegment = segments[segments.length - 1];
  const label = routeLabels[lastSegment];
  if (label) return { path: parentPath, label };

  return null;
}

export function DashboardHeader() {
  const pathname = usePathname();
  const t = useT();
  const isMobile = useIsMobile();
  const canSearch = useCan(["students.list", "leads.view", "teachers.view"]);
  const user = useAuth((s) => s.user);
  const teacherOnly = isTeacherOnly(user?.roles);
  const parentRoute = isMobile ? getParentRoute(pathname, teacherOnly) : null;
  // A teacher's top-level page has no trail at all (see `AppBreadcrumb`).
  const showTrail =
    !teacherOnly || pathname.replace(/\/$/, "").split("/").filter(Boolean).length > 1;

  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-12 sm:h-14 items-center gap-2 sm:gap-4 px-3 sm:px-4">
        {/* A teacher's phone has the bottom bar instead of the side menu. */}
        {!(teacherOnly && isMobile) && <SidebarTrigger />}
        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <div className="hidden sm:block">
          <BranchSwitcher />
        </div>

        <div className="flex-1 flex justify-center">
          {canSearch && <SearchDropdown />}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* key: sarlavha marshrutlar orasida saqlanadi; key bo'lmasa ochiq qolgan panel «orqaga»dan keyin o'zi qayta ochiladi */}
          <QollanmaYordamTugmasi key={pathname} />
          <HeaderTaskButton />
          <TashkentClock />
          <NotificationBell />
          <HeaderUserMenu />
        </div>
      </div>

      {showTrail && (
        <div className="px-3 sm:px-4 pb-2">
          {isMobile && parentRoute ? (
            <Link
              href={parentRoute.path}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              {t(parentRoute.label)}
            </Link>
          ) : (
            <AppBreadcrumb />
          )}
        </div>
      )}

      <PushPermissionPrompt />
    </header>
  );
}
