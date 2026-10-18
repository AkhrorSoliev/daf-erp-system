"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { INCOME_PART_COLOUR, IncomeBar } from "@/components/payments/overview/income-dialog";
import { paymentMethodLabel, som } from "@/components/payments/overview/overview-math";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { periodTitle } from "./payments-format";
import type { PeriodView, PaymentSummary } from "./payments-list-types";
import type { PeriodId } from "./payments-url";

// The bold amount sits inside a sentence the dictionary translates whole: put a marker where it goes, split on it.
const AMOUNT_MARK = "\u0000";

export function PaymentsSummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The summary card (spec B4 §3.4; `reports.finance` holders only). The big number
 * is the server's `total`; the green badge, the bar and the three part chips are
 * drawn for «Bu oy» alone, where the number is the «Kassaga tushdi» card's own.
 * A part chip sets the «Nimaga ketdi» filter; a second click on it clears it.
 */
export function PaymentsSummaryCard({ davr, period, summary, activePart, onPart }: {
  davr: PeriodId;
  period: Pick<PeriodView, "start">;
  summary: PaymentSummary;
  activePart: string;
  onPart: (next: string) => void;
}) {
  const t = useT();
  const month = period.start.slice(0, 7);
  const parts = [
    { id: "joriy", label: t("{month} to'lovi", { month: monthShort(month, t) }), amount: summary.parts.currentMonth, colour: INCOME_PART_COLOUR.current },
    { id: "oldindan", label: t("{month} uchun oldindan", { month: monthShort(addMonths(month, 1), t) }), amount: summary.parts.advance, colour: INCOME_PART_COLOUR.advance },
    { id: "qarz", label: t("Eski qarzlar"), amount: summary.parts.lateTotal, colour: INCOME_PART_COLOUR.late },
  ].filter((p) => p.amount > 0);
  const [onlineBefore, onlineAfter] = t("shundan onlayn avtomatik {amount} · {n} ta", { amount: AMOUNT_MARK, n: summary.online.count }).split(AMOUNT_MARK);
  const methods = summary.byMethod.filter((m) => m.amount > 0).sort((a, b) => b.amount - a.amount);
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">{periodTitle(davr, period.start, t)}</p>
          {davr === "oy" && (
            <Badge className="border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300" variant="outline">
              {t("«Kassaga tushdi» kartasidagi raqamning o'zi")}
            </Badge>
          )}
        </div>
        <div>
          <p className="font-heading text-3xl font-semibold tabular-nums">{som(summary.total, t)}</p>
          <p className="text-sm text-muted-foreground">
            {t("{n} ta to'lov", { n: summary.paymentCount })} · {t("{n} o'quvchi", { n: summary.payerCount })}
          </p>
        </div>
        {davr === "oy" && parts.length > 0 && (
          <>
            <IncomeBar parts={parts.map((p) => ({ key: p.id, amount: p.amount, colour: p.colour }))} />
            <div className="flex flex-wrap gap-2">
              {parts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activePart === p.id}
                  onClick={() => onPart(activePart === p.id ? "" : p.id)}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted"
                >
                  <span className={`size-2 rounded-full ${p.colour}`} />
                  {p.label} <b className="tabular-nums">{som(p.amount, t)}</b>
                </button>
              ))}
            </div>
          </>
        )}
        {(methods.length > 0 || summary.online.count > 0) && (
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <span key={m.method} className="rounded-full border px-3 py-1 text-xs">
                {paymentMethodLabel(m.method, t)} <b className="tabular-nums">{som(m.amount, t)}</b>
              </span>
            ))}
            {summary.online.count > 0 && (
              <span className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
                {onlineBefore}<b className="tabular-nums">{som(summary.online.amount, t)}</b>{onlineAfter}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
