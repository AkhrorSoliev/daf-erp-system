"use client";

import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthShort } from "@/components/payments/salary-utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { isMonthlyBillingMonth, som } from "./overview-math";
import { useFinancialOverview } from "./queries";

/**
 * Block 1 — «{Oy} oyi to'lovlari» (ADR-0058). Every figure is the server's
 * `monthCharges`; a month before monthly billing has none and says so.
 */
export function MonthChargesCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const overview = useFinancialOverview(month);
  const title = `${monthShort(month)} oyi to'lovlari`;
  if (!isMonthlyBillingMonth(month)) {
    return (
      <p className="text-sm text-muted-foreground">
        {monthShort(month)} — 12 talik tizim: oylik hisob yo&apos;q
      </p>
    );
  }
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title={title} onRetry={() => overview.refetch()} />;
  const c = overview.data.monthCharges;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Hisoblandi" value={som(c?.charged)} sub={c ? `${formatNumber(c.students)} o'quvchiga` : null} />
        <Figure
          label="To'landi"
          value={som(c?.paid)}
          sub={c ? (c.paidPct === null ? "hisob yozilmagan" : formatPercent(c.paidPct)) : null}
          tone="text-green-600 dark:text-green-400"
        />
        <Figure
          label="Qoldi"
          value={som(c?.unpaid)}
          sub={c?.unpaidStudents != null ? `${formatNumber(c.unpaidStudents)} o'quvchi to'lamagan` : null}
          tone={c && c.unpaid > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(c?.paidPct ?? 0, 100)}%` }} />
      </div>
      {isCurrent && (
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Kim to&apos;lamagan →
        </Link>
      )}
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string | null; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
