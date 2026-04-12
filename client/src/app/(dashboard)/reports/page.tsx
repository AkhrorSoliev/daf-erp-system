"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ReportsClient } from "@/components/reports/reports-client";

export default function ReportsPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const canViewReports = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  useEffect(() => {
    if (user && !canViewReports) {
      router.replace("/");
    }
  }, [user, canViewReports, router]);

  if (!canViewReports) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
          Hisobotlar
        </h1>
        <p className="text-muted-foreground">
          Tizim hisobotlari va statistika
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
