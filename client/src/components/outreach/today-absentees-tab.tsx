"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, ExternalLink } from "lucide-react";
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
import type {
  TodayAbsenteesResponse,
  TodayAbsenteeItem,
} from "./outreach-types";
import type { AddCallbackPrefill } from "./add-callback-dialog";
import { TablePagination } from "./table-pagination";

interface TodayAbsenteesTabProps {
  isActive: boolean;
  onAddCallback: (prefill: AddCallbackPrefill | null) => void;
}

export function TodayAbsenteesTab({
  isActive,
  onAddCallback,
}: TodayAbsenteesTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "today-absentees"],
    queryFn: () =>
      api
        .get<TodayAbsenteesResponse>("/outreach/today-absentees")
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  // Client-side pagination — the endpoint returns the full day's list
  // (bounded by per-center daily attendance, typically a few hundred rows).
  // Depend on data?.items directly so the memo doesn't bust on every render.
  const items = data?.items;
  const total = items?.length ?? 0;
  const paged = useMemo(() => {
    if (!items) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  if (isLoading) return <SkeletonRows />;

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Bugun darsga kelmagan o&apos;quvchi yo&apos;q
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
              <TableHead>Kurs</TableHead>
              <TableHead>Dars vaqti</TableHead>
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead>Izoh</TableHead>
              <TableHead className="w-40">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, idx) => (
              <Row
                key={row.attendanceId}
                row={row}
                index={(page - 1) * pageSize + idx}
                onAddCallback={onAddCallback}
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
  onAddCallback,
}: {
  row: TodayAbsenteeItem;
  index: number;
  onAddCallback: (prefill: AddCallbackPrefill | null) => void;
}) {
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-medium">
        {row.student.firstName} {row.student.lastName}
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell>{formatPhone(row.student.phone)}</TableCell>
      <TableCell>{row.group.name}</TableCell>
      <TableCell>{row.group.course?.name ?? "—"}</TableCell>
      <TableCell>
        {row.group.lessonStartTime && row.group.lessonEndTime
          ? `${row.group.lessonStartTime}–${row.group.lessonEndTime}`
          : "—"}
      </TableCell>
      <TableCell>
        {row.teacher
          ? `${row.teacher.firstName} ${row.teacher.lastName}`
          : "—"}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
        {row.note || "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onAddCallback({
                entityType: "Student",
                entityId: String(row.student.id),
                entityLabel: `${row.student.firstName} ${row.student.lastName}`,
                entityPhone: row.student.phone,
              })
            }
          >
            <PhoneCall className="mr-1 size-3.5" />
            Qo&apos;ng&apos;iroq
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/students/profile/${row.student.id}?tab=davomat`}>
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  // Stored as 9 digits without +998 prefix.
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
}
