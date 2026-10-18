"use client";

import { useState } from "react";
import { useT } from "@/i18n/context";
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
  const t = useT();
  const composition = useProfitComposition(month);
  const [open, setOpen] = useState(false);
  if (composition.isPending) return <BlockSkeleton />;
  if (composition.isError) return <BlockError title={t("Foyda")} onRetry={() => composition.refetch()} />;
  const c = composition.data;
  const withdrawn = c.withdrawals?.total ?? 0;
  const spent = c.teachers.total + c.staff.total + c.expenses.total + c.refunds;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("Foyda")}</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          c.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {som(c.netProfit, t)}
      </p>
      <MoneyRow label={t("darslar puli")} value={som(c.revenue.total, t)} />
      {withdrawn !== 0 && <MoneyRow label={t("balansdan yechib olingan")} value={som(withdrawn, t)} />}
      <MoneyRow label={t("chiqimlar")} value={som(-spent, t)} />
      {isCurrent && c.forecast && (
        <p className="text-xs text-muted-foreground">{t("oy oxiriga taxminan {amount}", { amount: som(c.forecast.expectedNetProfit, t) })}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        {t("Qanday hisoblandi →")}
      </button>
      <ProfitDialog open={open} onOpenChange={setOpen} month={month} composition={c} />
    </div>
  );
}
