"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhone } from "@/lib/format-utils";
import api from "@/lib/api";
import type {
  CallLogItem,
  CallLogsResponse,
  CallOutcome,
  CallReason,
} from "./outreach-types";
import { TablePagination } from "./table-pagination";

const REASON_INFO: Record<CallReason, { label: string; className: string }> = {
  ABSENCE: { label: "Kelmagan", className: "bg-amber-100 text-amber-800" },
  DEBT: { label: "Qarz", className: "bg-red-100 text-red-700" },
  REMOVAL: { label: "Chiqarish", className: "bg-orange-100 text-orange-800" },
  OTHER: { label: "Boshqa", className: "bg-slate-100 text-slate-700" },
};

const OUTCOME_INFO: Record<CallOutcome, { label: string; className: string }> = {
  ANSWERED: { label: "Gaplashildi", className: "bg-emerald-100 text-emerald-700" },
  NO_ANSWER: { label: "Javob bermadi", className: "bg-slate-100 text-slate-700" },
  WILL_COME: { label: "Keladi", className: "bg-indigo-100 text-indigo-700" },
  WILL_PAY: { label: "To'laydi", className: "bg-blue-100 text-blue-700" },
  PROMISED: { label: "Keladi / to'laydi", className: "bg-violet-100 text-violet-700" },
  LEFT: { label: "Tashlab ketdi", className: "bg-red-100 text-red-700" },
};

interface CallHistoryTabProps {
  isActive: boolean;
}

export function CallHistoryTab({ isActive }: CallHistoryTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["call-logs", page, pageSize],
    queryFn: () =>
      api
        .get<CallLogsResponse>("/call-logs", { params: { page, pageSize } })
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  if (isLoading) return <SkeletonRows />;

  if ((data?.items.length ?? 0) === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Hali qo&apos;ng&apos;iroqlar qayd qilinmagan
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
              <TableHead>Sana / vaqt</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Sabab</TableHead>
              <TableHead>Natija</TableHead>
              <TableHead>Izoh</TableHead>
              <TableHead>Kim qo&apos;ng&apos;iroq qildi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.items.map((row, idx) => (
              <Row key={row.id} row={row} index={(page - 1) * pageSize + idx} />
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        total={data!.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function Row({ row, index }: { row: CallLogItem; index: number }) {
  const reason = REASON_INFO[row.reason];
  const outcome = OUTCOME_INFO[row.outcome];
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="text-sm">
        {format(new Date(row.createdAt), "dd.MM.yyyy, HH:mm")}
      </TableCell>
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
      <TableCell>
        <Badge variant="outline" className={`${reason.className} hover:${reason.className}`}>
          {reason.label}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`${outcome.className} hover:${outcome.className}`}>
          {outcome.label}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
        {row.note || "—"}
      </TableCell>
      <TableCell className="text-sm">
        {row.calledBy.firstName} {row.calledBy.lastName}
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
