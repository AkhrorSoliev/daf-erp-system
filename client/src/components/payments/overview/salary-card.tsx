"use client";

import Link from "next/link";
import { BlockError, BlockSkeleton, MoneyRow } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

/**
 * «Oyliklar» — `SalaryMonthlyService.getMonthly` for the month, the Ish haqi
 * page's source: the teachers' full deserved pay plus the staff's monthly pay.
 * A month without per-lesson data (May) has no teacher figure: «—», «o'tish oyi».
 */
export function SalaryCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title="Oyliklar" onRetry={() => overview.refetch()} />;
  const s = overview.data.salary.computed;
  const teachers = s?.hasLessonData ? (s.fullDeserved ?? null) : null;
  const staff = s?.staff ?? null;
  const total = teachers != null && staff ? teachers + staff.monthly : null;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Oyliklar</p>
      <p className="text-2xl font-bold tabular-nums">{som(total)}</p>
      <p className="text-xs text-muted-foreground">
        ustozlar {som(teachers)} · xodimlar {som(staff?.monthly)}
      </p>
      <MoneyRow label="avans berilgan" value={som(s && staff ? s.advances + staff.advances : null)} />
      <MoneyRow
        label={isCurrent ? "oy oxirida beriladi" : "avansdan keyin"}
        value={som(s && staff ? s.netToPay + staff.netToPay : null)}
      />
      {s && !s.hasLessonData && <p className="text-xs text-amber-600 dark:text-amber-400">o&apos;tish oyi</p>}
      <Link href={`/payments/salary?month=${month}`} className="text-sm font-medium text-primary hover:underline">
        Ish haqi →
      </Link>
    </div>
  );
}
