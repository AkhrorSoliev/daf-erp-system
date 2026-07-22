"use client";

import { Wallet, Receipt, Banknote, CreditCard } from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";

export interface ExpensesSummary {
  totalAmount: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  /**
   * Always 0 now — TEACHER_ADVANCE is excluded from the expenses endpoint
   * (advances live on the Ish haqi page). Kept for response-shape stability.
   */
  advancesTotal: number;
}

/**
 * Four KPI cards bound to the backend `summary`, which spans the WHOLE filtered
 * set (not just the visible page) — so the totals stay correct while paging.
 *
 * "Jami summa" = umumiy operatsion xarajat. Ustozlar avansi bu ro'yxatga
 * umuman kirmaydi (u /payments/salary sahifasida boshqariladi).
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
