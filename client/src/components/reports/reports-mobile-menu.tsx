"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { reportsNavSections } from "@/lib/reports-nav";
import { usePermissions } from "@/hooks/use-permissions";

export function ReportsMobileMenu() {
  const can = usePermissions((s) => s.can);

  return (
    <div className="space-y-5">
      {reportsNavSections.map((section) => {
        const visibleItems = section.items.filter((item) => {
          return !item.permission || can(item.permission);
        });

        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title}>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
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
                    <span className="text-sm font-medium">{item.title}</span>
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
