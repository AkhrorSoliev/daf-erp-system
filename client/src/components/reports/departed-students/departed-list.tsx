"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatBalance, formatNumber, formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE, PaymentsPager } from "@/components/payments/list/payments-table";
import { formatDay, formatStudyMonths } from "./departed-format";
import type { DepartedList as DepartedListData, DepartedOverview, ListRow, ListState } from "./departed-types";
import { DEPARTED_PAGE_SIZES, type DepartedFilters } from "./departed-url";

type ListFilters = Pick<DepartedFilters, "q" | "reason" | "state" | "debtors">;

const STATE_OPTIONS = [
  { value: "all", label: "Hammasi" },
  { value: "ketgan", label: "Ketgan" },
  { value: "kutilmoqda", label: "Hali qaytishi mumkin" },
  { value: "qaytgan", label: "Qaytgan" },
];
const PILL: Record<ListState, string> = {
  ketgan: "bg-muted text-muted-foreground",
  kutilmoqda: "bg-amber-500/25 text-foreground",
  qaytgan: "bg-emerald-500/20 text-foreground",
};
const STATE_TEXT: Record<ListState, string> = { ketgan: "Ketgan", kutilmoqda: "Kutilmoqda", qaytgan: "Qaytgan" };
const HEADS = ["O'quvchi", "Oxirgi guruh", "Ketgan sana", "O'qidi", "Sabab", "Holat", "Qarzi"];

/** The debt page opens on «Shu oy», so a student who left is looked up in «O'qimayotganlar»; one who came back is not in it. */
const debtHref = (r: ListRow) => `/payments/debt?${r.state === "qaytgan" ? "" : "tab=chiqqan&"}search=${r.studentId}`;

function Row({ r }: { r: ListRow }) {
  return (
    <TableRow>
      <TableCell>
        <Link href={`/students/${r.studentId}`} className="font-medium hover:underline">{r.fullName}</Link>
        <div className="text-xs text-muted-foreground">{formatPhone(r.phone)}</div>
      </TableCell>
      <TableCell>
        {r.group ? <Link href={`/groups/${r.group.id}`} className="hover:underline">{r.group.name}</Link> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="tabular-nums">{formatDay(r.departedAt)}</TableCell>
      <TableCell className="tabular-nums">{formatStudyMonths(r.studyMonths)}</TableCell>
      <TableCell className="max-w-64 whitespace-normal">
        <div>{r.reason.name}</div>
        {r.comment && <div className="text-xs text-muted-foreground">{r.comment}</div>}
      </TableCell>
      <TableCell><span className={cn(PILL_BASE, PILL[r.state])}>{STATE_TEXT[r.state]}</span></TableCell>
      <TableCell className="text-right tabular-nums">
        {r.debt > 0 ? (
          <Link href={debtHref(r)} className="font-semibold text-destructive hover:underline">{formatBalance(r.debt)}</Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** «Ro'yxat» (spec B7a §4.5): the filters, the table and the pager. The page puts the list back on page 1 whenever a filter changes. */
export function DepartedList({ list, loading, stale, reasons, filters, page, pageSize, onFilter, onPage, onPageSize }: {
  list: DepartedListData | undefined;
  /** No answer for this page yet: skeleton rows. */
  loading: boolean;
  /** The rows are a previous answer: dimmed and inert, never drawn as current. */
  stale: boolean;
  reasons: DepartedOverview["reasons"] | undefined;
  filters: ListFilters;
  page: number;
  pageSize: number;
  onFilter: (u: Partial<DepartedFilters>) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const [text, setText] = useState(filters.q);
  const typed = useDebouncedValue(text, 300);
  useEffect(() => {
    if (typed !== filters.q) onFilter({ q: typed });
    // Only a new debounced text sends; a changed URL value must not be sent back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const reasonOptions = [
    { value: "all", label: "Barcha sabablar" },
    ...(reasons ?? []).map((r) => ({ value: r.reasonId ?? "none", label: r.name })),
  ];
  const reasonLabel = reasonOptions.find((o) => o.value === (filters.reason || "all"))?.label ?? "Sabab";
  const stateValue = filters.state || "all";
  const rows = list?.data;
  const filtered = Boolean(filters.q.trim() || filters.reason || filters.state || filters.debtors === "1");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Ro&apos;yxat</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ism, telefon yoki ID"
              aria-label="Qidirish"
              className="w-64 pl-8"
            />
          </div>
          <Select value={filters.reason || "all"} onValueChange={(v) => onFilter({ reason: v === "all" ? "" : v })}>
            <SelectTrigger className="w-auto min-w-44" aria-label="Sabab">
              <SelectValue>{reasonLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {reasonOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stateValue} onValueChange={(v) => onFilter({ state: v === "all" ? "" : v })}>
            <SelectTrigger className="w-auto min-w-40" aria-label="Holat">
              <SelectValue>{STATE_OPTIONS.find((o) => o.value === stateValue)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={filters.debtors === "1"} onCheckedChange={(c) => onFilter({ debtors: c === true ? "1" : "" })} />
            Faqat qarzi borlar
          </label>
        </div>

        {!loading && rows && rows.length === 0 ? (
          <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            {filtered ? "Hech narsa topilmadi" : "Bu davrda ketgan o'quvchi yo'q"}
          </p>
        ) : (
          <div aria-busy={stale} inert={stale} className={cn("flex flex-col gap-2", stale && "pointer-events-none opacity-60")}>
            <div className="rounded-md border">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    {HEADS.map((h) => <TableHead key={h} className={h === "Qarzi" ? "text-right" : undefined}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading || !rows
                    ? Array.from({ length: 5 }, (_, i) => (
                        <TableRow key={i}>
                          {HEADS.map((h) => <TableCell key={h}><Skeleton className="h-5 w-full" /></TableCell>)}
                        </TableRow>
                      ))
                    : rows.map((r) => <Row key={`${r.studentId}:${r.departedAt}`} r={r} />)}
                </TableBody>
              </Table>
            </div>
            {list && rows && !loading && (
              <p className="text-xs text-muted-foreground">
                {formatNumber(list.confirmed)} ketgan, shundan {formatNumber(list.returned)} qaytgan · {formatNumber(list.pending)} kutilmoqda
              </p>
            )}
          </div>
        )}

        {list && list.total > 0 && !loading && !stale && (
          <PaymentsPager
            page={page}
            pageSize={pageSize}
            total={list.total}
            sizes={DEPARTED_PAGE_SIZES}
            sizeLabel="Sahifadagi qatorlar soni"
            onPage={onPage}
            onPageSize={onPageSize}
          />
        )}
      </CardContent>
    </Card>
  );
}
