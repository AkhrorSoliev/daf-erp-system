"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { ReportsSidebar } from "./reports-sidebar";
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

  if (isMobile) {
    if (isReportsRoot) {
      return (
        <div className="space-y-4">
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight">
              Hisobotlar
            </h1>
            <p className="text-sm text-muted-foreground">
              Tizim hisobotlari va statistika
            </p>
          </div>
          <ReportsMobileMenu />
        </div>
      );
    }

    return <div className="space-y-4">{children}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Hisobotlar
        </h1>
        <p className="text-muted-foreground">
          Tizim hisobotlari va statistika
        </p>
      </div>
      <Separator />
      <div className="flex gap-8">
        <ReportsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
