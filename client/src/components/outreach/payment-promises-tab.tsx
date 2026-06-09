"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ban, Loader2, PhoneCall } from "lucide-react";
import toast from "react-hot-toast";
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import type {
  ActivePromiseItem,
  ActivePromisesResponse,
} from "./outreach-types";
import type { LogCallPrefill } from "./log-call-dialog";
import { TablePagination } from "./table-pagination";

interface PaymentPromisesTabProps {
  isActive: boolean;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}

export function PaymentPromisesTab({
  isActive,
  onLogCall,
}: PaymentPromisesTabProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "active-promises"],
    queryFn: () =>
      api
        .get<ActivePromisesResponse>("/outreach/promises")
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  const cancel = useMutation({
    mutationFn: (promiseId: string) =>
      api.patch(`/payment-promises/${promiseId}/cancel`),
    onSuccess: () => {
      toast.success("To'lov sanasi bekor qilindi");
      queryClient.invalidateQueries({ queryKey: ["outreach"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Bekor qilishda xatolik")),
  });

  const items = data?.items;
  const total = items?.length ?? 0;
  const paged = useMemo(() => {
    if (!items) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  // Clamp the page if the list shrank (e.g. after cancelling a promise) so the
  // user never lands on an out-of-range empty page.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [total, pageSize, page]);

  if (isLoading) return <SkeletonRows />;

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Faol to&apos;lov sanasi yo&apos;q
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>To&apos;lov sanasi</TableHead>
              <TableHead className="text-right">Joriy qarz</TableHead>
              <TableHead>Izoh</TableHead>
              <TableHead className="w-56">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, idx) => (
              <Row
                key={row.promiseId}
                row={row}
                index={(page - 1) * pageSize + idx}
                onCall={() =>
                  onLogCall({
                    studentId: row.student.id,
                    studentLabel: `${row.student.firstName} ${row.student.lastName}`,
                    studentPhone: row.student.phone,
                    reason: "DEBT",
                  })
                }
                onCancel={() => cancel.mutate(row.promiseId)}
                cancelling={
                  cancel.isPending && cancel.variables === row.promiseId
                }
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function Row({
  row,
  index,
  onCall,
  onCancel,
  cancelling,
}: {
  row: ActivePromiseItem;
  index: number;
  onCall: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <TableRow
      className={row.isOverdue ? "bg-red-50/40 dark:bg-red-950/10" : ""}
    >
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/students/profile/${row.student.id}`}
          className="hover:underline"
        >
          {row.student.firstName} {row.student.lastName}
        </Link>
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell>{formatPhone(row.student.phone)}</TableCell>
      <TableCell className="text-sm">
        {row.groups.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {row.groups.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`} className="hover:underline">
                {g.name}
              </Link>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={row.isOverdue ? "destructive" : "secondary"}
          className="text-[11px]"
        >
          {format(new Date(row.promiseDate), "dd.MM.yyyy")}
          {row.isOverdue ? " — muddati o'tgan" : ""}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-medium text-red-600 tabular-nums">
        {formatBalance(Math.abs(row.student.balance))}
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
        {row.comment || "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onCall}>
            <PhoneCall className="mr-1 size-3.5" />
            Aloqa qilindi
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Ban className="mr-1 size-3.5" />
            )}
            Bekor qilish
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
