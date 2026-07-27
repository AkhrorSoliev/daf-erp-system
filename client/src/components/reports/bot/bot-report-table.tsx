"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";

interface GateRow {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  blockedAt: string | null;
  joinedAt: string | null;
  leftAt: string | null;
}

const dt = (v: string | null) =>
  v ? format(new Date(v), "dd.MM.yyyy, HH:mm") : "—";

/** Qatorning holati — sodda so'zlar bilan, texnik atamasiz. */
function statusOf(row: GateRow) {
  if (row.leftAt) return { label: "Chiqib ketgan", variant: "destructive" as const };
  if (row.joinedAt) return { label: "A'zo", variant: "default" as const };
  if (row.blockedAt) return { label: "Kutilmoqda", variant: "secondary" as const };
  return { label: "—", variant: "outline" as const };
}

export function BotReportTable() {
  const [rows, setRows] = useState<GateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/telegram/channel-report/list", {
        params: { page, pageSize },
      });
      setRows(data.data);
      setTotal(data.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 font-medium">Foydalanuvchilar</p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Hali ma&apos;lumot yo&apos;q — kanal tekshiruvi yoqilgach, bu yerda
            ro&apos;yxat paydo bo&apos;ladi
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Bot to&apos;xtatdi</TableHead>
                  <TableHead>A&apos;zo bo&apos;ldi</TableHead>
                  <TableHead>Chiqib ketdi</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const status = statusOf(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground border-r">
                        {(page - 1) * pageSize + i + 1}
                      </TableCell>
                      <TableCell>
                        {row.username ? (
                          <span className="font-medium">@{row.username}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.firstName ?? `ID ${row.telegramUserId}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dt(row.blockedAt)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dt(row.joinedAt)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dt(row.leftAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 40, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-sm">
                Jami: {total} ta
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
