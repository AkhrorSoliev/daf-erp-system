"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError } from "@/components/payments/overview/block-state";
import { currentMonthKey, monthLabel } from "@/components/payments/salary-utils";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { KpiUserMonthsChart } from "./kpi-charts";
import { KPI_FIRST_MONTH, RESULT_TYPE_LABEL, dayText } from "./kpi-format";
import { useKpiUser } from "./kpi-queries";
import { TrendLine } from "./kpi-trend";

/**
 * One person's month (spec §7.8): the sum, the last months and every result
 * with how it was counted. Shared by the page's drawer and the employee
 * «KPI» tab; callers key it by person and month, which resets the page.
 */
export function KpiUserPanel({
  userId,
  month,
  onMonthChange,
}: {
  userId: number;
  month: string;
  onMonthChange?: (month: string) => void;
}) {
  const q = useKpiUser(userId, month);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const stepper = onMonthChange ? (
    <MonthStepper value={month} min={KPI_FIRST_MONTH} max={currentMonthKey()} onChange={onMonthChange} />
  ) : null;

  if (q.isPending) {
    return (
      <div className="space-y-4">
        {stepper}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="space-y-4">
        {stepper}
        <BlockError title="KPI" onRetry={() => q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const rows = d.results.slice((page - 1) * pageSize, page * pageSize);
  return (
    // Flex column: everything scrolls except the pagination, which keeps its own shrink-0 slot (client/CLAUDE.md).
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
      {stepper}
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{monthLabel(d.month)} KPI</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">{formatPrice(d.total)} so&apos;m</p>
        <TrendLine value={d.total} compare={d.compareTotal} unit="som" suffix=" — o'tgan oyga nisbatan" compareAvailable={d.compareAvailable} compareRecorded={d.compareRecorded} />
        <p className="mt-1 text-xs text-muted-foreground">Oylikka qo&apos;shilmaydi — kuzatuv</p>
      </div>

      <KpiUserMonthsChart data={d.months} />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Natijalar</h3>
        {d.results.length === 0 ? (
          <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
            Bu oyda natija yo&apos;q — boshqa oyni tanlab ko&apos;ring
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Natija</TableHead>
                  <TableHead>Qanday hisoblandi</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const cancelled = r.status === "CANCELLED";
                  return (
                    <TableRow key={r.id} className={cn(cancelled && "text-muted-foreground")}>
                      <TableCell className="border-r text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="whitespace-nowrap">{dayText(r.occurredAt)}</TableCell>
                      <TableCell>
                        <div className={cn(cancelled && "line-through")}>{RESULT_TYPE_LABEL[r.type]}</div>
                        <Link href={`/students/profile/${r.studentId}`} className="text-xs hover:underline">
                          {r.studentName}
                        </Link>
                        {cancelled && (
                          <div className="text-xs text-destructive">
                            {r.cancelReason}
                            {r.cancelledAt ? ` · ${dayText(r.cancelledAt)}` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(cancelled && "line-through")}>{r.explanation}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", cancelled && "line-through")}>
                        {formatPrice(r.amount)} so&apos;m
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </section>
      </div>
      {d.results.length > 0 && (
        <div className="shrink-0 border-t pt-3">
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={d.results.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
