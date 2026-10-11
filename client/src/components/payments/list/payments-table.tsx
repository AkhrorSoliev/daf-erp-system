"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { METHOD_FILTER, receivedByText, selectedLine } from "./payments-format";
import type { PartKind, PaymentListResponse, PaymentRow } from "./payments-list-types";

const METHOD_LABEL = Object.fromEntries(METHOD_FILTER.map((m) => [m.value, m.label]));
const HEADS = ["#", "Sana", "O'quvchi", "Guruh", "Summa", "Usul", "Nimaga ketdi", "Qabul qildi"];
const AMOUNT_AT = 4;

// Semantic tokens with a tint: the text stays `foreground`/`destructive`, so both themes read without `dark:` overrides.
export const PILL_BASE = "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";
const PILL = {
  muted: "bg-muted text-muted-foreground",
  red: "bg-destructive/15 text-destructive",
  orange: "bg-orange-500/20 text-foreground",
} as const;
export const PART_PILL: Record<PartKind, string> = {
  CURRENT: "bg-emerald-500/20 text-foreground",
  ADVANCE: "bg-blue-500/15 text-foreground",
  LATE: "bg-amber-500/25 text-foreground",
};

const Pill = ({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) => (
  <span className={cn(PILL_BASE, PILL[tone])}>{children}</span>
);
const Dash = () => <span className="text-muted-foreground">—</span>;

function PartsCell({ row, onOpen }: { row: PaymentRow; onOpen: (id: string) => void }) {
  if (row.status === "REVERSED") {
    if (row.correctedBy) {
      const to = row.correctedBy.id;
      return (
        <button type="button" className={cn(PILL_BASE, PILL.orange, "cursor-pointer hover:opacity-80")}
          onClick={(e) => { e.stopPropagation(); onOpen(to); }}>
          tuzatildi → {formatPrice(row.correctedBy.amount)}
        </button>
      );
    }
    return <Pill tone="red">bekor qilingan</Pill>;
  }
  if (!row.parts?.length) return <Dash />;
  return (
    <div className="flex flex-wrap gap-1">
      {row.parts.map((p) => (
        <span key={`${p.kind}-${p.monthKey}`} className={cn(PILL_BASE, PART_PILL[p.kind])}>
          {p.label} {formatPrice(p.amount)}
        </span>
      ))}
    </div>
  );
}

function PaymentRowView({ row, index, onOpen }: { row: PaymentRow; index: number; onOpen: (id: string) => void }) {
  const reversed = row.status === "REVERSED";
  const name = `${row.student.firstName} ${row.student.lastName}`;
  const [first, ...rest] = row.groups;
  // Only the row itself: an Enter on the «tuzatildi» button inside it must not open the row too.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      onOpen(row.id);
    }
  };
  return (
    <TableRow tabIndex={0} className={cn("cursor-pointer", reversed && "text-muted-foreground")} onClick={() => onOpen(row.id)} onKeyDown={onKeyDown}>
      <TableCell className="border-r text-muted-foreground tabular-nums">{index}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{tashkentDdMm(row.createdAt)} {tashkentHhmm(row.createdAt)}</TableCell>
      <TableCell>
        <div className={row.student.archived ? undefined : "font-semibold"}>
          {name}
          {row.student.archived && <> <Pill tone="muted">arxivda</Pill></>}
        </div>
        <div className="text-xs text-muted-foreground">ID {row.student.id}</div>
      </TableCell>
      <TableCell>
        {first ? (
          <span title={row.groups.map((g) => g.name).join(", ")}>
            {first.name}
            {rest.length > 0 && <> <Pill tone="muted">+{rest.length}</Pill></>}
          </span>
        ) : <Dash />}
      </TableCell>
      <TableCell className={cn("text-right font-semibold tabular-nums", reversed && "font-normal line-through")}>{formatPrice(row.amount)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {METHOD_LABEL[row.method] ?? row.method}
        {row.online && <> <Pill tone="muted">onlayn</Pill></>}
      </TableCell>
      <TableCell><PartsCell row={row} onOpen={onOpen} /></TableCell>
      <TableCell className="whitespace-nowrap">{receivedByText(row)}</TableCell>
    </TableRow>
  );
}

/** The list (spec B4 §3.7). `rows: undefined` or `loading` = skeleton rows; a click on a row or its «tuzatildi» pill opens that payment. */
export function PaymentsTable({ rows, loading, offset, onOpen, onClear }: {
  rows: PaymentRow[] | undefined;
  loading: boolean;
  /** (page - 1) x pageSize, for the `#` column. */
  offset: number;
  onOpen: (id: string) => void;
  /** Given when a filter is set: the empty state then offers to clear it. */
  onClear?: () => void;
}) {
  if (!loading && rows && rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        <p>Bu tanlovda to&apos;lov yo&apos;q</p>
        {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Tozalash</Button>}
      </div>
    );
  }
  return (
    <div className="rounded-md border">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            {HEADS.map((h, i) => (
              <TableHead key={h} className={i === 0 ? "w-12 border-r" : i === AMOUNT_AT ? "text-right" : undefined}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading || !rows
            ? Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i}>
                  {HEADS.map((h) => <TableCell key={h} className={h === "#" ? "border-r" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            : rows.map((r, i) => <PaymentRowView key={r.id} row={r} index={offset + i + 1} onOpen={onOpen} />)}
        </TableBody>
      </Table>
    </div>
  );
}

/** «Tanlangan: N ta to'lov · X so'm» (+ «shundan …»), spec B4 §3.6. */
export function PaymentsTotalsLine({ totals, holat, partLabel }: {
  totals: PaymentListResponse["totals"];
  holat: string;
  partLabel: string | null;
}) {
  const { main, part } = selectedLine(totals, holat, partLabel);
  return <p className="text-sm font-medium">{part ? `${main} · ${part}` : main}</p>;
}

const PAGE_SIZES = [50, 100];

/** «1–50 / N», the page size and ‹ ›. `onPageSize` must also put the page back on 1 (the caller sets both in one URL write). */
export function PaymentsPager({ page, pageSize, total, onPage, onPageSize }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">{from}–{to} / {formatNumber(total)}</span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="w-24" aria-label="Sahifadagi to'lovlar soni">
            <SelectValue>{pageSize} ta</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} ta</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" aria-label="Oldingi sahifa" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Keyingi sahifa" disabled={page >= last} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
