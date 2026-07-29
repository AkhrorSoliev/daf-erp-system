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
        {/* "Oyliklar", not "Ustozlar oyligi": the page covers teachers AND
            fixed-salary staff (admin / cashier / director). It is also the name
            this same report already carries in the Excel export. */}
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Oyliklar
        </h2>
        <p className="text-sm text-muted-foreground">
          Tanlangan oyda kimga qancha to&apos;lanishi
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
