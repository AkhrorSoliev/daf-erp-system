"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import {
  TRANSACTION_TYPE_INFO,
  type StudentTransaction,
} from "../student-profile-tabs-utils";
import { appendLedgerPage } from "./statement-utils";

const PAGE_SIZE = 20;
// Every type that moves the balance; LESSON_CONSUMPTION (amount 0) belongs
// to the Darslar tab.
const LEDGER_TYPES =
  "PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION,DISCOUNT_ADJUSTMENT,DEBT_WRITE_OFF,MOCK_EXAM_FEE";

type LedgerRow = Pick<
  StudentTransaction,
  "id" | "type" | "amount" | "balanceAfter" | "description" | "createdAt"
>;

const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));

/**
 * "Barcha yozuvlar": the raw ledger behind the statement, newest first.
 * Collapsed by default and loaded on first open; "Yana ko'rsatish" pages
 * through all of it (the old feed stopped at 20). `refreshKey` reloads it
 * after a payment correction.
 */
export function StatementLedger({
  studentId,
  refreshKey,
}: {
  studentId: number;
  refreshKey: number;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadedFor = useRef<number | null>(null);

  const load = useCallback(
    async (next: number) => {
      setLoading(true);
      try {
        const res = await api.get(`/transactions/student/${studentId}`, {
          params: { page: next, pageSize: PAGE_SIZE, types: LEDGER_TYPES },
        });
        const data = res.data.data as LedgerRow[];
        setRows((prev) => (next === 1 ? data : appendLedgerPage(prev, data)));
        setTotal(res.data.total as number);
        setPage(next);
      } catch (err) {
        toast.error(getErrorMessage(err, "Yozuvlarni yuklab bo'lmadi"));
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );

  useEffect(() => {
    if (!open || loadedFor.current === refreshKey) return;
    loadedFor.current = refreshKey;
    void load(1);
  }, [open, refreshKey, load]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5">
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
          Barcha yozuvlar
          {total > 0 && (
            <span className="text-muted-foreground">({total})</span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Turi</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead className="text-right">Keyingi balans</TableHead>
                <TableHead>Izoh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(r.createdAt), "dd.MM.yyyy, HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={TRANSACTION_TYPE_INFO[r.type]?.variant ?? "outline"}
                      className="text-[10px]"
                    >
                      {TRANSACTION_TYPE_INFO[r.type]?.label ?? r.type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono tabular-nums",
                      r.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {signed(r.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(r.balanceAfter)}
                  </TableCell>
                  <TableCell className="max-w-80 text-xs whitespace-normal text-muted-foreground">
                    {r.description}
                  </TableCell>
                </TableRow>
              ))}
              {loading &&
                rows.length === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`s${i}`}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Hali yozuv yo&apos;q
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {rows.length} / {total} ta yozuv
            </p>
            {rows.length < total && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void load(page + 1)}
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                Yana ko&apos;rsatish
              </Button>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
