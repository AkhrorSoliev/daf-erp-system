"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ReportsMobileMenu } from "./reports-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { canOpenReportPath } from "@/lib/reports-nav";

export function ReportsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  // Sahifa bo'yicha: administrator faqat Lidlar hisobotini ochadi
  // (`reports-nav.ts`). Backend ham qolgan hisobotlarni rad etadi.
  const canViewReports = canOpenReportPath(
    user?.roles.map((r) => r.id) ?? [],
    pathname,
  );

  useEffect(() => {
    if (user && !canViewReports) {
      router.replace("/");
    }
  }, [user, canViewReports, router]);

  if (user && !canViewReports) {
    return null;
  }

  const isReportsRoot = pathname === "/reports" || pathname === "/reports/";

  if (isMobile && isReportsRoot) {
    return (
      <div className="space-y-4">
        <ReportsMobileMenu />
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
