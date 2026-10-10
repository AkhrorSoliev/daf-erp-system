"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ReportsMobileMenu } from "./reports-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions, usePermissionsReady } from "@/hooks/use-permissions";
import { canOpenReportPath } from "@/lib/reports-nav";

export function ReportsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  // Page by page: an administrator opens only Lidlar and To'lov hisobotlari
  // (`reports-nav.ts`). The server refuses the other reports too. Wait for the
  // capability list before redirecting, so a fresh sign-in is not bounced.
  const canViewReports = canOpenReportPath(can, pathname);

  useEffect(() => {
    if (user && ready && !canViewReports) router.replace("/");
  }, [user, ready, canViewReports, router]);

  if (user && (!ready || !canViewReports)) return null;

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
