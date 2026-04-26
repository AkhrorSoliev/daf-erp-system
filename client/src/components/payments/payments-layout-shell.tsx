"use client";

import { usePathname } from "next/navigation";
import { PaymentsMobileMenu } from "./payments-mobile-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export function PaymentsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

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
