"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ReportsMobileMenu } from "./reports-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export function ReportsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const canViewReports =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

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
