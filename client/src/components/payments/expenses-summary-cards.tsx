"use client";

import { Wallet, Receipt, Banknote, CreditCard } from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";

export interface ExpensesSummary {
  totalAmount: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
}

/**
 * Four KPI cards bound to the backend `summary`, which spans the WHOLE filtered
 * set (not just the visible page) — so the totals stay correct while paging.
 */
export function ExpensesSummaryCards({
  summary,
}: {
  summary?: ExpensesSummary;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <SummaryCard
        icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
        tone="red"
        label="Jami summa"
        value={summary ? `${formatBalance(summary.totalAmount)}` : "—"}
      />
      <SummaryCard
        icon={<Receipt className="size-5 text-slate-700 dark:text-slate-300" />}
        tone="slate"
        label="Xarajatlar soni"
        value={summary ? `${formatNumber(summary.count)} ta` : "—"}
      />
      <SummaryCard
        icon={<Banknote className="size-5 text-green-700 dark:text-green-300" />}
        tone="green"
        label="Naqt jami"
        value={summary ? `${formatBalance(summary.cashTotal)}` : "—"}
      />
      <SummaryCard
        icon={<CreditCard className="size-5 text-blue-700 dark:text-blue-300" />}
        tone="blue"
        label="Karta jami"
        value={summary ? `${formatBalance(summary.cardTotal)}` : "—"}
      />
    </div>
  );
}
