"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { instantDayMonth } from "../debt/debt-format";
import { Pill } from "../debt/debt-table";
import { handedCell } from "./refunds-format";
import { useRefundHistory } from "./refunds-queries";
import { cleanHistoryPage, HISTORY_SCHEMA } from "./refunds-url";
import type { RefundHistoryRow } from "./refunds-types";

function HandedCell({ row }: { row: RefundHistoryRow }) {
  const cell = handedCell(row);
  if (!cell.cancelled) return <>{cell.text}</>;
  const pill = <Pill tone="muted">bekor qilindi</Pill>;
  if (!cell.reason) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help">{pill}</span></TooltipTrigger>
      <TooltipContent>{cell.reason}</TooltipContent>
    </Tooltip>
  );
}

/** «Qaytarishlar tarixi» (spec §3.6): handed-over and cancelled requests in scope, newest request first. */
export function RefundHistoryPage() {
  const { filters, setFilters } = useUrlFilters(HISTORY_SCHEMA);
  const { page, pageSize } = cleanHistoryPage(filters.page, filters.pageSize);
  const { data, isError, refetch } = useRefundHistory(page, pageSize);
  return (
    <div className="space-y-4">
      <Link href="/payments/refunds" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />Qaytariladigan pul
      </Link>
      <div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">Qaytarishlar tarixi</h1>
        <p className="text-sm text-muted-foreground">Berilgan va bekor qilingan so'rovlar</p>
      </div>
      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Tarixni yuklab bo'lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : !data ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
      ) : data.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Hali berilgan yoki bekor qilingan so'rov yo'q</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>O'quvchi</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>So'ralgan</TableHead>
                <TableHead>Berildi</TableHead>
                <TableHead>Kim berdi / Kim bekor qildi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="border-r text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.student.firstName} {r.student.lastName}</div>
                    <div className="text-xs text-muted-foreground">ID {r.student.id}{r.student.phone ? ` · ${formatPhone(r.student.phone)}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
                  <TableCell>{instantDayMonth(r.requestedAt)}</TableCell>
                  <TableCell><HandedCell row={r} /></TableCell>
                  <TableCell>{r.closedBy?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data && data.total > 0 && (
        <TablePagination total={data.total} page={page} pageSize={pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}
    </div>
  );
}
