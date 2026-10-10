"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions, usePermissionsReady } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permission-keys";

/** Moliya pages some Moliya users may not open, and the capability each needs. */
const PAGE_PERMISSIONS: Array<[string, PermissionKey]> = [
  ["/payments/expenses", "expenses.view"],
  ["/payments/salary", "salary.view"],
];

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);

  // Xarajatlar and Ish haqi need their own capability (the server checks the
  // same). Whoever lacks it does not see the link, and a direct visit (or an
  // old «?tab=markaz» link) goes back to /payments. Wait for the capability
  // list before redirecting, so a fresh sign-in is not bounced.
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  const needed = PAGE_PERMISSIONS.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const blocked = !!user && ready && needed !== undefined && !can(needed);

  useEffect(() => {
    if (blocked) {
      router.replace("/payments");
    }
  }, [blocked, router]);

  if (blocked || (!!user && needed !== undefined && !ready)) {
    return null;
  }

  const isPaymentsRoot = pathname === "/payments" || pathname === "/payments/";

  if (isMobile && isPaymentsRoot) {
    return (
      <div className="space-y-4">
        <PaymentsMobileMenu />
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
