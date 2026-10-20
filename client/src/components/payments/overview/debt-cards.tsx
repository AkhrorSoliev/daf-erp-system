"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { cn } from "@/lib/utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

const KINDS = [
  ["ungrouped", msg("guruhsiz")],
  ["frozen", msg("muzlatilganlar")],
  ["left", msg("ketganlar")],
] as const;

/**
 * Block 2 — today's debt as two numbers that are never added (ADR-0059): the
 * studying debtors' «eski qarz» and the not-studying debt in its three kinds
 * (ADR-0067). Current month only: it is today's state.
 */
export function DebtCards({ month }: { month: string }) {
  const t = useT();
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title={t("Qarzdorlik")} onRetry={() => overview.refetch()} />;
  const split = overview.data.debtSplit;
  const byKind = split.notStudying.byKind;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("Eski qarz — o'qiyotganlar")}</p>
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            split.studying.older > 0 && "text-red-600 dark:text-red-400",
          )}
        >
          {som(split.studying.older, t)}
        </p>
        {split.studying.olderCount != null && (
          <p className="text-xs text-muted-foreground">
            {t("{n} o'quvchi · o'tgan oylardan qolgan", { n: formatNumber(split.studying.olderCount) })}
          </p>
        )}
        <Link href="/payments/debt?tab=eski" className="text-sm font-medium text-primary hover:underline">
          {t("Ro'yxat →")}
        </Link>
      </div>
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("O'qimayotganlar qarzi")}</p>
        <p className="text-2xl font-bold tabular-nums">{som(split.notStudying.total, t)}</p>
        <p className="text-xs text-muted-foreground">{t("{n} kishi · undirish ishi", { n: formatNumber(split.notStudying.count) })}</p>
        {byKind && (
          <ul className="space-y-0.5 pt-1 text-sm">
            {KINDS.map(([key, label]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {t(label)} · {formatNumber(byKind[key].count)}
                </span>
                <span className="tabular-nums">{som(byKind[key].total, t)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/payments/debt?tab=chiqqan" className="text-sm font-medium text-primary hover:underline">
          {t("Undirish ro'yxati →")}
        </Link>
      </div>
    </div>
  );
}
