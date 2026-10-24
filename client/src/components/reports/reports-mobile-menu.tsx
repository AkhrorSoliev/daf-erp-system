"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { reportItemVisible, reportsNavSections } from "@/lib/reports-nav";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, usePermissionsReady } from "@/hooks/use-permissions";
import { useT } from "@/i18n/context";

export function ReportsMobileMenu() {
  const t = useT();
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];

  // Until the capability list is known every item is hidden; render nothing
  // rather than an empty menu.
  if (!ready) return null;

  return (
    <div className="space-y-5">
      {reportsNavSections.map((section) => {
        const visibleItems = section.items.filter((item) => reportItemVisible(item, can, roleIds));

        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title}>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(section.title)}
            </p>
            <div className="rounded-lg border bg-card divide-y">
              {visibleItems.map((item) => (
                <Link
                  key={item.url}
                  href={item.url}
                  className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50 first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{t(item.title)}</span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
