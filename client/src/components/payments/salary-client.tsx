"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SalaryBreakdownDrawer } from "./salary-breakdown-drawer";
import { SalaryMonthlyView } from "./salary-monthly-view";

export function SalaryClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canPay = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [breakdownPaymentId, setBreakdownPaymentId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Ustozlar oyligi
        </h2>
        <p className="text-sm text-muted-foreground">
          Tanlangan oy bo&apos;yicha har bir o&apos;qituvchining to&apos;liq ishlangani,
          o&apos;quvchilar to&apos;lagani va markaz qo&apos;shimchasi
        </p>
      </div>

      <SalaryMonthlyView
        isCeo={isCeo}
        canPay={canPay}
        onOpenBreakdown={setBreakdownPaymentId}
        refreshKey={refreshKey}
        bumpRefresh={bumpRefresh}
      />

      <SalaryBreakdownDrawer
        salaryPaymentId={breakdownPaymentId}
        onClose={() => setBreakdownPaymentId(null)}
        isCeo={isCeo}
        canPay={canPay}
        onChanged={bumpRefresh}
      />
    </div>
  );
}
