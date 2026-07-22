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
   * Ustozlarga berilgan avans (TEACHER_ADVANCE) jami. "Jami summa" kartasidan
   * CHIQARIB tashlanadi — avans sof xarajat emas, oylikdan keyin ushlanadi.
   */
  advancesTotal: number;
}

/**
 * Four KPI cards bound to the backend `summary`, which spans the WHOLE filtered
 * set (not just the visible page) — so the totals stay correct while paging.
 *
 * "Jami summa" = umumiy xarajatlar MINUS ustozlar avansi (sof xarajat). Avans
 * bu yerda hisobga olinmaydi (u oylikdan keyin ushlanadi), shuning uchun alohida
 * "Ustozlar avansi" kartasi ham ko'rsatilmaydi.
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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <SummaryCard
        icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
        tone="red"
        label="Jami summa"
        value={summary ? `${formatBalance(nonAdvanceTotal)}` : "—"}
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
