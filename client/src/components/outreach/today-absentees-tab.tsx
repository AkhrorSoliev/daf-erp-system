"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import type { LogCallPrefill } from "./log-call-dialog";
import { TablePagination } from "./table-pagination";

interface TodayAbsenteesTabProps {
  isActive: boolean;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}

export function TodayAbsenteesTab({
  isActive,
  onLogCall,
}: TodayAbsenteesTabProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Frozen at mount so the calendar's "no future dates" rule doesn't flap
  // with the wall clock during a session.
  const today = useMemo(() => new Date(), []);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "today-absentees", dateStr],
    queryFn: () =>
      api
        .get<TodayAbsenteesResponse>("/outreach/today-absentees", {
          params: { date: dateStr },
        })
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

  // Clamp the page if the list shrank (e.g. after a student was removed) so the
  // user never lands on an out-of-range empty page.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [total, pageSize, page]);

  const handleDateChange = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-48">
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
            maxDate={today}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {isLoading ? "Yuklanmoqda…" : `Jami: ${total} ta`}
        </span>
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : total === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {format(selectedDate, "dd.MM.yyyy")} sanasida darsga kelmagan
          o&apos;quvchi yo&apos;q
        </div>
      ) : (
        <>
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
                  <TableHead className="w-60">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row, idx) => (
                  <Row
                    key={row.attendanceId}
                    row={row}
                    index={(page - 1) * pageSize + idx}
                    onLogCall={onLogCall}
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
        </>
      )}
    </div>
  );
}

function Row({
  row,
  index,
  onLogCall,
}: {
  row: TodayAbsenteeItem;
  index: number;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}) {
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/students/profile/${row.student.id}?tab=davomat`}
          className="hover:underline"
        >
          {row.student.firstName} {row.student.lastName}
        </Link>
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell>{formatPhone(row.student.phone)}</TableCell>
      <TableCell>
        <Link href={`/groups/${row.group.id}`} className="hover:underline">
          {row.group.name}
        </Link>
      </TableCell>
      <TableCell>{row.group.course?.name ?? "—"}</TableCell>
      <TableCell>
        {row.group.lessonStartTime && row.group.lessonEndTime
          ? `${row.group.lessonStartTime}–${row.group.lessonEndTime}`
          : "—"}
      </TableCell>
      <TableCell>
        {row.teacher ? (
          <Link
            href={`/teachers/profile/${row.teacher.id}`}
            className="hover:underline"
          >
            {row.teacher.firstName} {row.teacher.lastName}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
        {row.note || "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {row.calledToday && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Bog&apos;lanildi
            </Badge>
          )}
          <Button
            size="sm"
            variant={row.calledToday ? "ghost" : "outline"}
            onClick={() =>
              onLogCall({
                studentId: row.student.id,
                studentLabel: `${row.student.firstName} ${row.student.lastName}`,
                studentPhone: row.student.phone,
                reason: "ABSENCE",
              })
            }
          >
            <PhoneCall className="mr-1 size-3.5" />
            Natija kiritish
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
