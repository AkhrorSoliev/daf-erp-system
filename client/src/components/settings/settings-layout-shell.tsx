"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { SettingsSidebar } from "./settings-sidebar";
import { useAuth } from "@/hooks/use-auth";

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
  const user = useAuth((s) => s.user);
  const isTeacherOnly =
    (user?.roles.some((r) => r.id === 4) &&
      !user?.roles.some((r) => [1, 2, 3].includes(r.id))) ??
    false;

  useEffect(() => {
    if (isTeacherOnly) {
      router.replace("/");
    }
  }, [isTeacherOnly, router]);

  if (isTeacherOnly) {
    return null;
  }

  const isDetail = isDetailPage(pathname);
  const isGeneral = pathname.startsWith("/settings/general");

  if (isDetail || isGeneral) {
    return <>{children}</>;
  }

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
