"use client";

import {
  Wallet,
  Receipt,
  Banknote,
  CreditCard,
  HandCoins,
  Coins,
} from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";

export interface ExpensesSummary {
  totalAmount: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  /**
   * Ustozlarga berilgan avans (TEACHER_ADVANCE) jami. Jami summaga KIRADI —
   * alohida card sifatida ham ko'rsatiladi.
   */
  advancesTotal: number;
}

/**
 * Six KPI cards bound to the backend `summary`, which spans the WHOLE filtered
 * set (not just the visible page) — so the totals stay correct while paging.
 *
 * "Jami summa" covers every category (advance included) — the full cash-out
 * record. "Avanssiz jami" is the same total minus teacher advances (pure
 * operational spend). "Ustozlar avansi" breaks the advance out on its own card.
 */
export function ExpensesSummaryCards({
  summary,
}: {
  summary?: ExpensesSummary;
}) {
  const nonAdvanceTotal = summary
    ? summary.totalAmount - summary.advancesTotal
    : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <SummaryCard
        icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
        tone="red"
        label="Jami summa"
        value={summary ? `${formatBalance(summary.totalAmount)}` : "—"}
      />
      <SummaryCard
        icon={<Coins className="size-5 text-violet-700 dark:text-violet-300" />}
        tone="violet"
        label="Avanssiz jami"
        value={summary ? `${formatBalance(nonAdvanceTotal)}` : "—"}
      />
      <SummaryCard
        icon={<HandCoins className="size-5 text-amber-700 dark:text-amber-300" />}
        tone="amber"
        label="Ustozlar avansi"
        value={summary ? `${formatBalance(summary.advancesTotal)}` : "—"}
      />
      <SummaryCard
        icon={<Banknote className="size-5 text-green-700 dark:text-green-300" />}
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
      <SummaryCard
        icon={<Receipt className="size-5 text-slate-700 dark:text-slate-300" />}
        tone="slate"
        label="Xarajatlar soni"
        value={summary ? `${formatNumber(summary.count)} ta` : "—"}
      />
    </div>
  );
}
