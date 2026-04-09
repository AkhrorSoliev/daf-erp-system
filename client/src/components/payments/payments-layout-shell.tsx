"use client";

import { usePathname } from "next/navigation";
import { PaymentsSidebar } from "./payments-sidebar";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const isPaymentsRoot = pathname === "/payments" || pathname === "/payments/";

  // Mobile layout: drill-down pattern
  if (isMobile) {
    if (isPaymentsRoot) {
      return (
        <div className="space-y-4">
          <PaymentsMobileMenu />
        </div>
      );
    }

    // Sub-page → content only (back button is in DashboardHeader)
    return <div className="space-y-4">{children}</div>;
  }

  // Desktop layout: sidebar + content
  return (
    <div className="flex gap-8">
      <PaymentsSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
