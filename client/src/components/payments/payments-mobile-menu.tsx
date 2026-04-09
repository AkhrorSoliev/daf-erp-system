"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { paymentsNavItems } from "@/lib/payments-nav";
import { useAuth } from "@/hooks/use-auth";

export function PaymentsMobileMenu() {
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];

  const visibleItems = paymentsNavItems.filter((item) => {
    if (!item.visibleForRoles) return true;
    return item.visibleForRoles.some((id) => userRoleIds.includes(id));
  });

  return (
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
  );
}
