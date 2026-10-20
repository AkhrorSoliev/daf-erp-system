"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthShort } from "../salary-utils";
import { dueCell, instantDayMonth, KIND_PILL, lastCallText, promiseText } from "./debt-format";
import type { DebtListItem, DebtTab, PromiseCell } from "./debt-types";

const PILL = {
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  muted: "bg-muted text-muted-foreground",
} as const;

export const Pill = ({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) => (
  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", PILL[tone])}>{children}</span>
);
const Dash = () => <span className="text-muted-foreground">—</span>;

function PromiseCellView({ p }: { p: PromiseCell | null }) {
  const t = useT();
  return p ? <Pill tone={p.state === "open" ? "green" : "red"}>{promiseText(p, t)}</Pill> : <Dash />;
}

/** Spec §2.3, after `#`. The amount column (AMOUNT_AT) is right-aligned. */
const HEADS: Record<DebtTab, string[]> = {
  "shu-oy": [msg("O'quvchi"), msg("Guruh"), msg("Qarz"), msg("To'lov muddati"), msg("Va'da"), msg("Oxirgi aloqa")],
  eski: [msg("O'quvchi"), msg("Guruh"), msg("Eski qarz"), msg("Qaysi oylardan"), msg("Oxirgi to'lov"), msg("Va'da")],
  chiqqan: [msg("O'quvchi"), msg("Holat"), msg("Oxirgi guruh"), msg("Qarz"), msg("Qaysi oylardan"), msg("Oxirgi aloqa")],
};
const AMOUNT_AT: Record<DebtTab, number> = { "shu-oy": 2, eski: 2, chiqqan: 3 };

function NameCell({ r, tab, openable }: { r: DebtListItem; tab: DebtTab; openable: boolean }) {
  const t = useT();
  return (
    <div>
      {/* Coloured like a link: the row opens the student's drawer. */}
      <div className={cn("font-medium", openable && "text-primary group-hover:underline")}>{r.firstName} {r.lastName}</div>
      <div className="text-xs text-muted-foreground">ID {r.studentId}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</div>
      {tab === "shu-oy" && r.otherPart > 0 && <div className="mt-1"><Pill tone="red">{t("+ eski qarz {amount}", { amount: formatPrice(r.otherPart) })}</Pill></div>}
      {tab === "eski" && r.otherPart > 0 && <div className="mt-1"><Pill tone="amber">{t("+ shu oy {amount}", { amount: formatPrice(r.otherPart) })}</Pill></div>}
    </div>
  );
}

function GroupCell({ r }: { r: DebtListItem }) {
  if (r.groups.length === 0) return <Dash />;
  const teachers = [...new Set(r.groups.flatMap((g) => g.teachers.map((teacher) => teacher.name)))];
  return (
    <div>
      <div>{r.groups.map((g) => g.name).join(", ")}</div>
      {teachers.length > 0 && <div className="text-xs text-muted-foreground">{teachers.join(", ")}</div>}
    </div>
  );
}

function MonthsCell({ r }: { r: DebtListItem }) {
  const t = useT();
  return r.months.length === 0 ? <Dash /> : (
    <div className="flex flex-wrap gap-1">
      {r.months.map((m) => <Pill key={m.monthKey} tone="red">{monthShort(m.monthKey, t)} {formatPrice(m.amount)}</Pill>)}
    </div>
  );
}

function CallCell({ r }: { r: DebtListItem }) {
  const t = useT();
  const text = lastCallText(r.lastCall, t);
  return text ? <span>{text}</span> : <span className="text-muted-foreground">{t("aloqa bo'lmagan")}</span>;
}

function DueCellView({ due, today }: { due: string | null; today: string }) {
  const t = useT();
  const c = dueCell(due, today, t);
  if (!c) return <Dash />;
  return c.overdue ? <Pill tone="red">{c.text}</Pill> : <span>{c.text}</span>;
}

export function DebtTable({ tab, rows, loading, filtered, offset, today, onOpen, onPay }: {
  tab: DebtTab;
  rows: DebtListItem[] | undefined;
  loading: boolean;
  /** A list filter is set: the empty state then suggests widening it. */
  filtered: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  today: string;
  onOpen?: (studentId: number) => void;
  onPay: (row: DebtListItem) => void;
}) {
  const t = useT();
  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>;
  if (!rows?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {filtered ? t("Hech kim topilmadi — qidiruvni tozalab yoki filtrni kengaytirib ko'ring") : t("Bu bo'limda qarzdor yo'q")}
      </p>
    );
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            {HEADS[tab].map((h, i) => <TableHead key={h} className={i === AMOUNT_AT[tab] ? "text-right" : undefined}>{t(h)}</TableHead>)}
            <TableHead className="w-0"><span className="sr-only">{t("Amal")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const kindPill = r.kind ? KIND_PILL[r.kind] : null;
            return (
            <TableRow
              key={r.studentId}
              tabIndex={onOpen ? 0 : undefined}
              className={onOpen ? "group cursor-pointer" : undefined}
              onClick={() => onOpen?.(r.studentId)}
              // Only the row itself: an Enter on «To'lov» inside it must not open the drawer too.
              onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen?.(r.studentId); }}
            >
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell><NameCell r={r} tab={tab} openable={!!onOpen} /></TableCell>
              {tab === "chiqqan" ? (
                <>
                  <TableCell>{kindPill && <Pill tone={r.kind === "frozen" ? "amber" : "muted"}>{t(kindPill)}</Pill>}</TableCell>
                  <TableCell>{r.groups[0]?.name ?? "—"}</TableCell>
                </>
              ) : <TableCell><GroupCell r={r} /></TableCell>}
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
              {tab === "shu-oy" && (
                <>
                  <TableCell><DueCellView due={r.dueDate} today={today} /></TableCell>
                  <TableCell><PromiseCellView p={r.promise} /></TableCell>
                  <TableCell><CallCell r={r} /></TableCell>
                </>
              )}
              {tab === "eski" && (
                <>
                  <TableCell><MonthsCell r={r} /></TableCell>
                  <TableCell>{r.lastPayment ? `${instantDayMonth(r.lastPayment.createdAt)} · ${formatPrice(r.lastPayment.amount)}` : "—"}</TableCell>
                  <TableCell><PromiseCellView p={r.promise} /></TableCell>
                </>
              )}
              {tab === "chiqqan" && (
                <>
                  <TableCell><MonthsCell r={r} /></TableCell>
                  <TableCell><CallCell r={r} /></TableCell>
                </>
              )}
              <TableCell className="text-right">
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onPay(r); }}>{t("To'lov")}</Button>
                  {onOpen && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground group-hover:text-foreground" onClick={(e) => { e.stopPropagation(); onOpen(r.studentId); }}>
                      {t("Batafsil")}<ChevronRight className="ml-0.5 size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
