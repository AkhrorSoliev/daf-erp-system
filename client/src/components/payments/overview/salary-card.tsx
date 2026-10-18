"use client";

import Link from "next/link";
import { useT } from "@/i18n/context";
import { BlockError, BlockSkeleton, MoneyRow } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

/**
 * «Oyliklar» — `SalaryMonthlyService.getMonthly` for the month, the Ish haqi
 * page's source: the teachers' full deserved pay plus the staff's monthly pay.
 * A month without per-lesson data (May) has no teacher figure: «—», «o'tish oyi».
 */
export function SalaryCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const t = useT();
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title={t("Oyliklar")} onRetry={() => overview.refetch()} />;
  const s = overview.data.salary.computed;
  const teachers = s?.hasLessonData ? (s.fullDeserved ?? null) : null;
  const staff = s?.staff ?? null;
  const total = teachers != null && staff ? teachers + staff.monthly : null;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t("Oyliklar")}</p>
      <p className="text-2xl font-bold tabular-nums">{som(total, t)}</p>
      <p className="text-xs text-muted-foreground">
        {t("ustozlar {teachers} · xodimlar {staff}", { teachers: som(teachers, t), staff: som(staff?.monthly, t) })}
      </p>
      <MoneyRow label={t("avans (ushlanadi)")} value={som(s && staff ? s.advances + staff.advances : null, t)} />
      <MoneyRow
        label={isCurrent ? t("oy oxirida beriladi") : t("avansdan keyin")}
        value={som(s && staff ? s.netToPay + staff.netToPay : null, t)}
      />
      {s && !s.hasLessonData && <p className="text-xs text-amber-600 dark:text-amber-400">{t("o'tish oyi")}</p>}
      <Link href={`/payments/salary?month=${month}`} className="text-sm font-medium text-primary hover:underline">
        {t("Ish haqi →")}
      </Link>
    </div>
  );
}
