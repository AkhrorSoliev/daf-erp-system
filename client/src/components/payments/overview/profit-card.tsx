"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlockError, BlockSkeleton, MoneyRow } from "./block-state";
import { som } from "./overview-math";
import { ProfitDialog } from "./profit-dialog";
import { useProfitComposition } from "./queries";

/**
 * «Foyda» — the canonical net profit (`GET /reports/profit-composition`, built
 * from `assembleMonthlyNetProfit`). The lines add up to the big figure.
 */
export function ProfitCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const composition = useProfitComposition(month);
  const [open, setOpen] = useState(false);
  if (composition.isPending) return <BlockSkeleton />;
  if (composition.isError) return <BlockError title="Foyda" onRetry={() => composition.refetch()} />;
  const c = composition.data;
  const withdrawn = c.withdrawals?.total ?? 0;
  const spent = c.teachers.total + c.staff.total + c.expenses.total + c.refunds;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Foyda</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          c.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {som(c.netProfit)}
      </p>
      <MoneyRow label="darslar puli" value={som(c.revenue.total)} />
      {withdrawn !== 0 && <MoneyRow label="balansdan yechib olingan" value={som(withdrawn)} />}
      <MoneyRow label="chiqimlar" value={som(-spent)} />
      {isCurrent && c.forecast && (
        <p className="text-xs text-muted-foreground">oy oxiriga taxminan {som(c.forecast.expectedNetProfit)}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        Qanday hisoblandi →
      </button>
      <ProfitDialog open={open} onOpenChange={setOpen} month={month} composition={c} />
    </div>
  );
}
