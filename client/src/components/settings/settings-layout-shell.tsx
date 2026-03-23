"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SettingsSidebar } from "./settings-sidebar";

/**
 * Checks if the current path is a detail page (has an ID segment).
 * List pages: /settings/courses, /settings/rooms
 * Detail pages: /settings/courses/1, /settings/rooms/5
 */
function isDetailPage(pathname: string): boolean {
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  // /settings/courses → ["settings", "courses"] = 2 segments (list)
  // /settings/courses/1 → ["settings", "courses", "1"] = 3+ segments (detail)
  return segments.length > 2;
}

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = isDetailPage(pathname);

  if (isDetail) {
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
