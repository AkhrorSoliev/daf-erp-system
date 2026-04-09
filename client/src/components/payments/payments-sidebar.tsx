"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { paymentsNavItems } from "@/lib/payments-nav";
import { useAuth } from "@/hooks/use-auth";

export function PaymentsSidebar() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];

  const visibleItems = paymentsNavItems.filter((item) => {
    if (!item.visibleForRoles) return true;
    return item.visibleForRoles.some((id) => userRoleIds.includes(id));
  });

  return (
    <nav className="w-64 shrink-0 space-y-0.5">
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
    </nav>
  );
}
