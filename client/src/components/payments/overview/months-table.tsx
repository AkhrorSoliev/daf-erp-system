"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { monthLabel } from "@/components/payments/salary-utils";
import { useT } from "@/i18n/context";
import { BlockError, BlockSkeleton } from "./block-state";
import { isMonthlyBillingMonth, som } from "./overview-math";
import { useFinancialTrend } from "./queries";

/**
 * Block 4 — «Oylar bo'yicha»: the month and up to five before it, newest
 * first (the server stops at the reporting floor). Foyda is the canonical
 * profit; a month whose canonical figure failed (`kassa`) shows «—», never
 * the cash figure under the Foyda heading.
 */
export function MonthsTable({ month, current }: { month: string; current: string }) {
  const t = useT();
  const trend = useFinancialTrend(month);
  if (trend.isPending) return <BlockSkeleton className="h-56" />;
  if (trend.isError) return <BlockError title={t("Oylar bo'yicha")} onRetry={() => trend.refetch()} />;
  const rows = [...trend.data].reverse();
  return (
    <section className="space-y-3">
      <h3 className="font-heading text-base font-semibold">{t("Oylar bo'yicha")}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Oy")}</TableHead>
            <TableHead className="text-right">{t("Kassaga tushdi")}</TableHead>
            <TableHead className="text-right">{t("Foyda")}</TableHead>
            <TableHead>{t("Izoh")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.monthKey}>
              <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
              <TableCell>{monthLabel(r.monthKey, t)}</TableCell>
              <TableCell className="text-right tabular-nums">{som(r.income, t)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.profitBasis === "kanonik" ? som(r.profit, t) : "—"}
              </TableCell>
              <TableCell>
                {r.monthKey === current ? (
                  <Badge variant="secondary">{t("oy tugamagan")}</Badge>
                ) : !isMonthlyBillingMonth(r.monthKey) ? (
                  <Badge variant="outline">{t("12 talik tizim")}</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
