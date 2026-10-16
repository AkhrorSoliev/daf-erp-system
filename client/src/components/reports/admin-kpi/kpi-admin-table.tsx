"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { ratioText } from "./kpi-format";
import { TrendMark } from "./kpi-trend";
import type { KpiAdminRow } from "./kpi-types";

function CountCell({
  count,
  amount,
  compare,
  compareAvailable,
  compareRecorded,
}: {
  count: number;
  amount: number;
  compare: number;
  compareAvailable: boolean;
  compareRecorded: boolean;
}) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatNumber(count)} · {formatPrice(amount)} so&apos;m
      <TrendMark
        value={count}
        compare={compare}
        unit="count"
        compareAvailable={compareAvailable}
        compareRecorded={compareRecorded}
      />
    </span>
  );
}

/**
 * Every administrator of the month (spec §7.7). Intentionally NOT paginated (spec decision):
 * it is the team at a glance, like the payroll table, and a page break would hide people from the ranking.
 */
export function KpiAdminTable({
  rows,
  compareAvailable,
  compareRecorded,
  onOpen,
}: {
  rows: KpiAdminRow[];
  compareAvailable: boolean;
  /** False while the compare month was recorded in part: no ▲/▼ in the cells. */
  compareRecorded: boolean;
  onOpen: (userId: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda natija ham, band lid ham yo&apos;q — boshqa oyni tanlab ko&apos;ring
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Xodim</TableHead>
          <TableHead>Lid to&apos;lov qildi</TableHead>
          <TableHead>Va&apos;da bajarildi</TableHead>
          <TableHead>Lid → to&apos;lov</TableHead>
          <TableHead>Va&apos;da bajarilishi</TableHead>
          <TableHead>Qaytgan lidlar</TableHead>
          <TableHead className="text-right">Jami summa</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow
            key={r.userId}
            tabIndex={0}
            aria-label={`${r.name} — natijalarni ochish`}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpen(r.userId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r.userId);
              }
            }}
          >
            <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <CountCell
                count={r.leadPaid.count}
                amount={r.leadPaid.amount}
                compare={r.leadPaid.compare}
                compareAvailable={compareAvailable}
                compareRecorded={compareRecorded}
              />
            </TableCell>
            <TableCell>
              <CountCell
                count={r.promiseKept.count}
                amount={r.promiseKept.amount}
                compare={r.promiseKept.compare}
                compareAvailable={compareAvailable}
                compareRecorded={compareRecorded}
              />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {ratioText(r.leadToPaid.pct, r.leadToPaid.paid, r.leadToPaid.received)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {ratioText(r.promiseRate.pct, r.promiseRate.kept, r.promiseRate.closed)}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatNumber(r.expired.count)}
              <TrendMark
                value={r.expired.count}
                compare={r.expired.compare}
                unit="count"
                higherIsBetter={false}
                compareAvailable={compareAvailable}
                compareRecorded={compareRecorded}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPrice(r.total)} so&apos;m</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
