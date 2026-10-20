"use client";

import { useState } from "react";
import { TablePagination } from "@/components/outreach/table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale, useT } from "@/i18n/context";
import { formatPrice } from "@/lib/format-utils";
import { methodLabel } from "../expenses/expenses-labels";
import type { AdvanceRow } from "../salary-advances-tab";
import { keepsMonthCapital, monthShort } from "../salary-utils";
import { SalaryToneBadge } from "./salary-tone-badge";

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/** "2026-10-03" → "03.10.2026". */
const longDay = (iso: string) => iso.split("-").reverse().join(".");

/** Newest advance first; the server sends this order already, so this only guards the table. */
const newestFirst = (a: AdvanceRow, b: AdvanceRow) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** The rows of one page. Pagination state lives in the wrapper below (client/CLAUDE.md). */
function AdvancesRows({ rows, firstNumber }: { rows: AdvanceRow[]; firstNumber: number }) {
  const t = useT();
  const { locale } = useLocale();
  // The month inside «oktabr oyligidan …» is lower-cased in Uzbek and Russian, not in de/en.
  const deductMonth = (key: string) => {
    const name = monthShort(key, t);
    return keepsMonthCapital(locale) ? name : name.toLowerCase();
  };
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Sana")}</TableHead>
            <TableHead>{t("Kimga")}</TableHead>
            <TableHead className="text-right">{t("Summa")}</TableHead>
            <TableHead>{t("Naqd / karta")}</TableHead>
            <TableHead>{t("Kim berdi")}</TableHead>
            <TableHead>{t("Holat")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a, i) => (
            <TableRow key={a.id}>
              <TableCell className="border-r text-muted-foreground tabular-nums">{firstNumber + i}</TableCell>
              <TableCell className="tabular-nums">{longDay(a.date)}</TableCell>
              <TableCell className="font-medium">{fullName(a.user)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPrice(a.amount)}</TableCell>
              <TableCell>{methodLabel(a.paymentMethod, t)}</TableCell>
              <TableCell className={a.createdBy ? undefined : "text-muted-foreground"}>
                {a.createdBy ? fullName(a.createdBy) : "—"}
              </TableCell>
              <TableCell>
                {/* Settled: the month of the payment that took it. Waiting: the advance's own month (spec §2.6). */}
                <SalaryToneBadge tone={a.settled ? "green" : "amber"}>
                  {a.settled
                    ? t("{month} oyligidan ushlangan", { month: deductMonth(a.deductMonth) })
                    : t("{month} oyligidan ushlanadi", { month: deductMonth(a.deductMonth) })}
                </SalaryToneBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * «Avanslar» tab: the month's advances under the calendar, newest first, with
 * the month each one is taken from. Mount it with `key={month}` so a new month
 * starts on page one.
 */
export function SalaryAdvancesTable({ advances }: { advances: AdvanceRow[] }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const sorted = [...advances].sort(newestFirst);
  // A delete can leave the page we are on past the end.
  const current = Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)));
  const start = (current - 1) * pageSize;

  return (
    <div className="space-y-3">
      <AdvancesRows rows={sorted.slice(start, start + pageSize)} firstNumber={start + 1} />
      <TablePagination
        total={sorted.length}
        page={current}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
      <p className="text-xs text-muted-foreground">{t("Avans berilgan oyining oyligidan ushlanadi.")}</p>
    </div>
  );
}
