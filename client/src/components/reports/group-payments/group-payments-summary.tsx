"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { pctText, SAME_AS_OVERVIEW, summaryTitle } from "./group-payments-format";
import type { GpSummary } from "./group-payments-types";

export function GroupPaymentsSummarySkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-6 w-80" />
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, sub, danger }: { label: string; value: number; sub: string; danger?: boolean }) {
  const t = useT();
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("font-heading text-2xl font-semibold tabular-nums", danger && "text-destructive")}>{formatPrice(value)} {t("so'm")}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Chip({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <span className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
      <span className={cn("size-2 rounded-full", dot)} />
      {label} <b className="tabular-nums">{formatNumber(count)}</b>
    </span>
  );
}

/** The month's card (spec B5 §3.3): the overview's first row, cut by group. The table's filters never change it. */
export function GroupPaymentsSummary({ month, summary }: { month: string; summary: GpSummary }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">{summaryTitle(month, t)}</p>
        {summary.groups === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bu oyda hisob yozilmagan")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Figure
                label={t("Hisoblandi")}
                value={summary.charged}
                sub={t("{groups} guruh · {students} o'quvchi", { groups: formatNumber(summary.groups), students: formatNumber(summary.students) })}
              />
              <Figure label={t("To'landi")} value={summary.paid} sub={pctText(summary.paidPct)} />
              <Figure label={t("Qoldi")} value={summary.unpaid} sub={t("guruhlarning o'rtachasi {pct}", { pct: pctText(summary.avgGroupPct) })} danger />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip dot="bg-emerald-500" label={t("To'liq to'lagan guruh")} count={summary.fullyPaidGroups} />
              <Chip dot="bg-destructive" label={t("Yarmidan kami to'langan")} count={summary.underHalfGroups} />
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ {t(SAME_AS_OVERVIEW)}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
