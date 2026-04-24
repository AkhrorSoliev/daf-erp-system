"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportsNavSections } from "@/lib/reports-nav";
import { useAuth } from "@/hooks/use-auth";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function ReportsSidebar() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];

  return (
    <nav className="w-64 shrink-0 space-y-1">
      {reportsNavSections.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (!item.visibleForRoles) return true;
          return item.visibleForRoles.some((id) => userRoleIds.includes(id));
        });

        if (visibleItems.length === 0) return null;

        const isSectionActive = visibleItems.some((item) =>
          pathname.startsWith(item.url)
        );

        return (
          <Collapsible key={section.title} defaultOpen={isSectionActive || true}>
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
              {section.title}
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-1 space-y-0.5 py-1">
                {visibleItems.map((item) => {
                  const isActive = pathname.startsWith(item.url);
                  return (
                    <Link
                      key={item.url}
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}
