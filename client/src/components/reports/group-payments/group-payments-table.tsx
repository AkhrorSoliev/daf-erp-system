"use client";

import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { FIRST_COLUMN, GROUP_MARK_LABEL, pctText, pctTone, type Tone } from "./group-payments-format";
import type { GpRow, Kesim } from "./group-payments-types";

// Semantic tokens with a tint, as the B4 pills: both themes read without `dark:` overrides.
export const TONE_BAR: Record<Tone, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-destructive", muted: "bg-muted-foreground/40" };
export const TONE_PILL: Record<Tone, string> = {
  green: "bg-emerald-500/20 text-foreground",
  amber: "bg-amber-500/25 text-foreground",
  red: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const headsOf = (kesim: Kesim) => ["#", FIRST_COLUMN[kesim], ...(kesim === "guruh" ? ["Ustoz"] : []), "O'quvchi", "Hisoblandi", "To'landi", "Qoldi", "Foiz", "To'lamagan"];
const RIGHT = new Set(["O'quvchi", "Hisoblandi", "To'landi", "Qoldi", "To'lamagan"]);
const MutedZero = () => <span className="text-muted-foreground">0</span>;

function PctCell({ pct }: { pct: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", TONE_BAR[pctTone(pct)])} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <span className="text-xs tabular-nums">{pctText(pct)}</span>
    </div>
  );
}

function RowView({ row, kesim, index, onOpen }: { row: GpRow; kesim: Kesim; index: number; onOpen?: (id: string) => void }) {
  const open = onOpen ? () => onOpen(row.id) : undefined;
  const onKeyDown = (e: KeyboardEvent) => {
    if (open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open();
    }
  };
  return (
    <TableRow tabIndex={open ? 0 : undefined} className={cn(open && "cursor-pointer")} onClick={open} onKeyDown={open ? onKeyDown : undefined}>
      <TableCell className="border-r text-muted-foreground tabular-nums">{index}</TableCell>
      <TableCell>
        <div className="font-semibold">
          {row.name}
          {row.marks.map((m) => (
            <span key={m} className={cn(PILL_BASE, "ml-1 bg-muted align-middle text-muted-foreground")}>{GROUP_MARK_LABEL[m]}</span>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">{row.sub}</div>
      </TableCell>
      {kesim === "guruh" && (
        <TableCell className="text-sm">{row.teachers?.length ? row.teachers.join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
      )}
      <TableCell className="text-right tabular-nums">{formatNumber(row.students)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPrice(row.charged)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPrice(row.paid)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.unpaid > 0 ? <span className="font-semibold text-destructive">{formatPrice(row.unpaid)}</span> : <MutedZero />}
      </TableCell>
      <TableCell><PctCell pct={row.paidPct} /></TableCell>
      <TableCell className="text-right tabular-nums">{row.unpaidStudents > 0 ? formatNumber(row.unpaidStudents) : <MutedZero />}</TableCell>
    </TableRow>
  );
}

/** The table (spec B5 §3.5). `rows: undefined` or `loading` = skeleton rows; only «Guruhlar» rows open the drawer. */
export function GroupPaymentsTable({ kesim, rows, loading, offset, emptyMonth, onOpen, onClear }: {
  kesim: Kesim;
  rows: GpRow[] | undefined;
  loading: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  /** The month has no charge at all (not a filter that found nothing). */
  emptyMonth: boolean;
  onOpen: (groupId: string) => void;
  /** Given when a filter is set: the empty state then offers to clear it. */
  onClear?: () => void;
}) {
  if (!loading && rows && rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        {emptyMonth ? (
          <p>Bu oyda hisob yozilmagan</p>
        ) : (
          <>
            <p>Hech narsa topilmadi</p>
            {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Tozalash</Button>}
          </>
        )}
      </div>
    );
  }
  const heads = headsOf(kesim);
  return (
    <div className="rounded-md border">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            {heads.map((h, i) => (
              <TableHead key={h} className={i === 0 ? "w-12 border-r" : RIGHT.has(h) ? "text-right" : undefined}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading || !rows
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  {heads.map((h) => <TableCell key={h} className={h === "#" ? "border-r" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            : rows.map((r, i) => (
                <RowView key={r.id} row={r} kesim={kesim} index={offset + i + 1} onOpen={kesim === "guruh" ? onOpen : undefined} />
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
