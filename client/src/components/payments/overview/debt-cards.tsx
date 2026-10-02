"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format-utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

const KINDS = [
  ["ungrouped", "guruhsiz"],
  ["frozen", "muzlatilgan"],
  ["left", "ketgan"],
] as const;

/**
 * Block 2 — today's debt as two numbers that are never added (ADR-0059): the
 * studying debtors' «eski qarz» and the not-studying debt in its three kinds
 * (ADR-0067). Current month only: it is today's state.
 */
export function DebtCards({ month }: { month: string }) {
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title="Qarzdorlik" onRetry={() => overview.refetch()} />;
  const split = overview.data.debtSplit;
  const byKind = split.notStudying.byKind;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Eski qarz — o&apos;qiyotganlar</p>
        <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{som(split.studying.older)}</p>
        {split.studying.olderCount != null && (
          <p className="text-xs text-muted-foreground">
            {formatNumber(split.studying.olderCount)} o&apos;quvchi · o&apos;tgan oylardan qolgan
          </p>
        )}
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Ro&apos;yxat →
        </Link>
      </div>
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">O&apos;qimayotganlar qarzi</p>
        <p className="text-2xl font-bold tabular-nums">{som(split.notStudying.total)}</p>
        <p className="text-xs text-muted-foreground">{formatNumber(split.notStudying.count)} kishi · undirish ishi</p>
        {byKind && (
          <ul className="space-y-0.5 pt-1 text-sm">
            {KINDS.map(([key, label]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {label} · {formatNumber(byKind[key].count)}
                </span>
                <span className="tabular-nums">{som(byKind[key].total)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Undirish ro&apos;yxati →
        </Link>
      </div>
    </div>
  );
}
