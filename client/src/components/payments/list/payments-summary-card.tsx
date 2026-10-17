"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBalance } from "@/lib/format-utils";
import { INCOME_PART_COLOUR, IncomeBar } from "@/components/payments/overview/income-dialog";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { METHOD_FILTER, periodTitle } from "./payments-format";
import type { PeriodView, PaymentSummary } from "./payments-list-types";
import type { PeriodId } from "./payments-url";

const METHOD_LABEL = Object.fromEntries(METHOD_FILTER.map((m) => [m.value, m.label]));

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
  const month = period.start.slice(0, 7);
  const parts = [
    { id: "joriy", label: `${monthShort(month)} to'lovi`, amount: summary.parts.currentMonth, colour: INCOME_PART_COLOUR.current },
    { id: "oldindan", label: `${monthShort(addMonths(month, 1))} uchun oldindan`, amount: summary.parts.advance, colour: INCOME_PART_COLOUR.advance },
    { id: "qarz", label: "Eski qarzlar", amount: summary.parts.lateTotal, colour: INCOME_PART_COLOUR.late },
  ].filter((p) => p.amount > 0);
  const methods = summary.byMethod.filter((m) => m.amount > 0).sort((a, b) => b.amount - a.amount);
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">{periodTitle(davr, period.start)}</p>
          {davr === "oy" && (
            <Badge className="border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300" variant="outline">
              «Kassaga tushdi» kartasidagi raqamning o&apos;zi
            </Badge>
          )}
        </div>
        <div>
          <p className="font-heading text-3xl font-semibold tabular-nums">{formatBalance(summary.total)}</p>
          <p className="text-sm text-muted-foreground">
            {summary.paymentCount} ta to&apos;lov · {summary.payerCount} o&apos;quvchi
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
                  {p.label} <b className="tabular-nums">{formatBalance(p.amount)}</b>
                </button>
              ))}
            </div>
          </>
        )}
        {(methods.length > 0 || summary.online.count > 0) && (
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <span key={m.method} className="rounded-full border px-3 py-1 text-xs">
                {METHOD_LABEL[m.method] ?? m.method} <b className="tabular-nums">{formatBalance(m.amount)}</b>
              </span>
            ))}
            {summary.online.count > 0 && (
              <span className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
                shundan onlayn avtomatik <b className="tabular-nums">{formatBalance(summary.online.amount)}</b> · {summary.online.count} ta
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
