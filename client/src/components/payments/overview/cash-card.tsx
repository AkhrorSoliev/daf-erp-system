"use client";

import { useState } from "react";
import { BlockError, BlockSkeleton } from "./block-state";
import { IncomeDialog } from "./income-dialog";
import { dayMonth, som } from "./overview-math";
import { useFinancialOverview, useIncomeAttribution } from "./queries";

/**
 * «Kassaga tushdi» — the month's cash from the ledger replay, the same total
 * its dialog decomposes and the 21:00 report prints. «kecha» belongs to the
 * current month only (the server sends none otherwise, nor on the 1st).
 */
export function CashCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const attribution = useIncomeAttribution(month);
  const overview = useFinancialOverview(month);
  const [open, setOpen] = useState(false);
  if (attribution.isPending) return <BlockSkeleton />;
  if (attribution.isError) return <BlockError title="Kassaga tushdi" onRetry={() => attribution.refetch()} />;
  const a = attribution.data;
  const yesterday = isCurrent ? overview.data?.income.yesterday : null;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Kassaga tushdi</p>
      <p className="text-2xl font-bold tabular-nums">{som(a.total)}</p>
      {a.lateTotal > 0 && <p className="text-xs text-muted-foreground">shundan eski qarzlardan {som(a.lateTotal)}</p>}
      {yesterday && (
        <p className="text-xs text-muted-foreground">
          kecha ({dayMonth(yesterday.date)}) {som(yesterday.amount)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        Qayerdan keldi →
      </button>
      <IncomeDialog
        open={open}
        onOpenChange={setOpen}
        month={month}
        data={a}
        byMethod={overview.data?.income.byMethod ?? []}
      />
    </div>
  );
}
