"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface DebtorSummary {
  totalDebt: number;
  debtorCount: number;
  avgDebt: number;
  openPromises: number;
  overduePromises: number;
}

/**
 * The one thing the call centre still needs to know about payment dates: some
 * have passed.
 *
 * The "To'lov sanalari" tab used to live here and is now part of /payments/debt,
 * where the debt itself is. Moving a list out of someone's daily screen without
 * leaving a signal is how work quietly stops happening — so the count stays,
 * and the link goes straight to the filtered list rather than to a page the
 * reader then has to narrow themselves.
 *
 * Renders nothing when no promise is overdue. A banner that is always there is
 * one people stop seeing.
 */
export function OverduePromisesBanner() {
  const { selectedBranch } = useBranchSwitcher();

  const { data } = useQuery({
    queryKey: ["debtors", "summary", selectedBranch?.id, "all"],
    queryFn: () =>
      api
        .get<DebtorSummary>("/payments/debtors/summary", {
          params: { branchId: selectedBranch?.id, studentStatus: "all" },
        })
        .then((r) => r.data),
  });

  if (!data || data.overduePromises === 0) return null;

  return (
    <Link
      href="/payments/debt?promise=overdue"
      className="group flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-amber-100 p-2 dark:bg-amber-900/40">
          <CalendarClock className="size-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {formatNumber(data.overduePromises)} ta to&apos;lov sanasi
            o&apos;tib ketgan
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            Jami qarz {formatBalance(data.totalDebt)} ·{" "}
            {formatNumber(data.openPromises)} ta sana kutilmoqda
          </p>
        </div>
      </div>
      <span className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-amber-900 dark:text-amber-200">
        Ro&apos;yxatni ochish
        <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
