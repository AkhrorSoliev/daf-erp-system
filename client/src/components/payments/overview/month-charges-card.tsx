"use client";

import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
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
  const t = useT();
  const overview = useFinancialOverview(month);
  const title = t("{month} oyi to'lovlari", { month: monthShort(month, t) });
  if (!isMonthlyBillingMonth(month)) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("{month} — 12 talik tizim: oylik hisob yo'q", { month: monthShort(month, t) })}
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
        <Figure
          label={t("Hisoblandi")}
          value={som(c?.charged, t)}
          sub={c ? t("{n} o'quvchiga", { n: formatNumber(c.students) }) : null}
        />
        <Figure
          label={t("To'landi")}
          value={som(c?.paid, t)}
          sub={c ? (c.paidPct === null ? t("hisob yozilmagan") : formatPercent(c.paidPct)) : null}
          tone="text-green-600 dark:text-green-400"
        />
        <Figure
          label={t("Qoldi")}
          value={som(c?.unpaid, t)}
          sub={c?.unpaidStudents != null ? t("{n} o'quvchi to'lamagan", { n: formatNumber(c.unpaidStudents) }) : null}
          tone={c && c.unpaid > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(c?.paidPct ?? 0, 100)}%` }} />
      </div>
      {isCurrent && (
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          {t("Kim to'lamagan →")}
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
