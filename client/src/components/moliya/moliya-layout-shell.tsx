"use client";

import { usePathname } from "next/navigation";
import { MoliyaSidebar } from "./moliya-sidebar";
import { MoliyaMobileMenu } from "./moliya-mobile-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export function MoliyaLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const isPaymentsRoot = pathname === "/payments" || pathname === "/payments/";

  // Mobile layout: drill-down pattern
  if (isMobile) {
    if (isPaymentsRoot) {
      return (
        <div className="space-y-4">
          <MoliyaMobileMenu />
        </div>
      );
    }

    // Sub-page → content only (back button is in DashboardHeader)
    return <div className="space-y-4">{children}</div>;
  }

  // Desktop layout: sidebar + content
  return (
    <div className="flex gap-8">
      <MoliyaSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
