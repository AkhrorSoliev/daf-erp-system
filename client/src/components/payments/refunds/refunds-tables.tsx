"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import { Pill } from "../debt/debt-table";
import { AGE_STATE, duePill, KIND_WORD, noticeText, sinceText } from "./refunds-format";
import type { PendingRefundRow, RefundableRow, RefundableTab } from "./refunds-types";

function NameCell({ name, id, phone, link = false }: { name: string; id: number; phone: string; link?: boolean }) {
  return (
    <div>
      {/* Coloured like a link where the row opens the drawer. */}
      <div className={cn("font-medium", link && "text-primary group-hover:underline")}>{name}</div>
      <div className="text-xs text-muted-foreground">ID {id}{phone ? ` · ${formatPhone(phone)}` : ""}</div>
    </div>
  );
}

/** «Kutilayotgan qaytarishlar» (spec §3.3), oldest due first as the server sends them. */
export function PendingTable({ rows, offset, canHandOver, canCancel, onHandOver, onCancel }: {
  rows: PendingRefundRow[];
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  canHandOver: boolean;
  canCancel: boolean;
  onHandOver: (row: PendingRefundRow) => void;
  onCancel: (row: PendingRefundRow) => void;
}) {
  const t = useT();
  const actions = canHandOver || canCancel;
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("O'quvchi")}</TableHead>
            <TableHead className="text-right">{t("Summa")}</TableHead>
            <TableHead>{t("So'ralgan")}</TableHead>
            <TableHead>{t("Muddat")}</TableHead>
            <TableHead>{t("Holat")}</TableHead>
            {actions && <TableHead className="w-0"><span className="sr-only">{t("Amal")}</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const pill = duePill(r.due, t);
            return (
              <TableRow key={r.id}>
                <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
                <TableCell><NameCell name={`${r.firstName} ${r.lastName}`} id={r.studentId} phone={r.phone} /></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
                <TableCell>{instantDayMonth(r.requestedAt)}</TableCell>
                <TableCell>{t("{date} gacha", { date: dayMonth(r.dueDate) })}</TableCell>
                <TableCell><Pill tone={pill.tone}>{pill.text}</Pill></TableCell>
                {actions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {canHandOver && <Button size="sm" onClick={() => onHandOver(r)}>{t("Berildi")}</Button>}
                      {canCancel && <Button size="sm" variant="outline" onClick={() => onCancel(r)}>{t("So'rovni bekor qilish")}</Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Spec §3.4, after `#`; the money column is right-aligned. */
const heads = (tab: RefundableTab) =>
  [msg("O'quvchi"), KIND_WORD[tab], tab === "muzlatilgan" ? msg("Holat") : msg("Oxirgi guruh"), msg("Puli"), msg("Xabar")];

/** The open tab's students, largest balance first (the server's order). A row opens the drawer. */
export function RefundableTable({ tab, rows, loading, searched, offset, onOpen }: {
  tab: RefundableTab;
  rows: RefundableRow[] | undefined;
  loading: boolean;
  /** A search is set: the empty state then suggests clearing it. */
  searched: boolean;
  offset: number;
  onOpen: (studentId: number) => void;
}) {
  const t = useT();
  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>;
  if (!rows?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {searched ? t("Hech kim topilmadi — qidiruvni tozalab ko'ring") : t("Bu bo'limda puli qolgan o'quvchi yo'q")}
      </p>
    );
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            {heads(tab).map((h, i) => <TableHead key={h} className={i === 3 ? "text-right" : undefined}>{t(h)}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const ageState = AGE_STATE[r.ageBucket];
            return (
            <TableRow key={r.studentId} tabIndex={0} className="group cursor-pointer" onClick={() => onOpen(r.studentId)}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen(r.studentId); }}>
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell><NameCell name={`${r.firstName} ${r.lastName}`} id={r.studentId} phone={r.phone} link /></TableCell>
              <TableCell>{sinceText(r.since, r.days, t)}</TableCell>
              <TableCell>
                {tab === "muzlatilgan"
                  ? <Pill tone={ageState.tone}>{t(ageState.text)}</Pill>
                  : (r.lastGroup?.name ?? "—")}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.balance)}</TableCell>
              <TableCell className={cn(!r.notice && "text-muted-foreground")}>{noticeText(r.notice, t)}</TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
