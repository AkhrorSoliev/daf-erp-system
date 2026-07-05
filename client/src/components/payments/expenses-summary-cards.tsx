"use client";

import { Wallet, Receipt, Banknote, CreditCard, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";

export interface ExpensesSummary {
  totalAmount: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  /**
   * Ustozga berilgan avans (TEACHER_ADVANCE) jami. Headline totallarga
   * kirmaydi — avans Xarajat emas, oylik sifatida hisoblanadi (overview
   * "Chiqimlar" kartasi bilan bir xil mantiq).
   */
  advancesTotal: number;
}

/**
 * Four KPI cards bound to the backend `summary`, which spans the WHOLE filtered
 * set (not just the visible page) — so the totals stay correct while paging.
 *
 * Totals are AVANSSIZ: TEACHER_ADVANCE is excluded from Jami / Naqt / Karta so
 * they match the /payments/overview "Chiqimlar" figure. The advance is surfaced
 * separately in a note below (the rows still show in the list).
 */
export function ExpensesSummaryCards({
  summary,
}: {
  summary?: ExpensesSummary;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
          tone="red"
          label="Jami summa"
          value={summary ? `${formatBalance(summary.totalAmount)}` : "—"}
        />
        <SummaryCard
          icon={
            <Receipt className="size-5 text-slate-700 dark:text-slate-300" />
          }
          tone="slate"
          label="Xarajatlar soni"
          value={summary ? `${formatNumber(summary.count)} ta` : "—"}
        />
        <SummaryCard
          icon={
            <Banknote className="size-5 text-green-700 dark:text-green-300" />
          }
          tone="green"
          label="Naqt jami"
          value={summary ? `${formatBalance(summary.cashTotal)}` : "—"}
        />
        <SummaryCard
          icon={
            <CreditCard className="size-5 text-blue-700 dark:text-blue-300" />
          }
          tone="blue"
          label="Karta jami"
          value={summary ? `${formatBalance(summary.cardTotal)}` : "—"}
        />
      </div>

      {summary && summary.advancesTotal > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="flex w-fit cursor-help items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 text-amber-500" />
              shundan Ustoz avansi:{" "}
              <span className="font-medium text-foreground">
                {formatBalance(summary.advancesTotal)}
              </span>{" "}
              — jami summaga kirmaydi
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            Ustozga berilgan avans Xarajat emas — u oylik sifatida hisoblanadi
            va keyingi oylikdan ushlab qolinadi. Shu sabab yuqoridagi totallar
            avanssiz ko&apos;rsatiladi (Ustoz oyliklari bo&apos;limida
            ko&apos;rinadi).
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
