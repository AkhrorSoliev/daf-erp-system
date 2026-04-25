"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DialogPaginationFooter } from "./dialog-pagination-footer";
import type {
  DepartedAfterChangeRow,
  RetentionQueryParams,
} from "./teacher-change-types";

interface DepartedAfterChangeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryParams: RetentionQueryParams;
}

export function DepartedAfterChangeDialog({
  open,
  onOpenChange,
  queryParams,
}: DepartedAfterChangeDialogProps) {
  const { data, isLoading } = useQuery<DepartedAfterChangeRow[]>({
    queryKey: ["departed-after-change", queryParams],
    queryFn: () =>
      api
        .get<DepartedAfterChangeRow[]>(
          "/reports/departed-students/departed-after-change",
          { params: queryParams },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () =>
      data?.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) ?? [],
    [data, clampedPage, pageSize],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(1200px,95vw)] w-[min(1200px,95vw)] max-h-[85vh] overflow-hidden flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>
            O&apos;zgarishdan keyin ketgan o&apos;quvchilar
          </DialogTitle>
          <DialogDescription>
            Ustoz almashgandan so&apos;ng 5 dars ichida guruhdan chiqib ketgan
            o&apos;quvchilar
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>O&apos;quvchi</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Ustoz almashgan sana</TableHead>
                <TableHead>Oldingi → Yangi ustoz</TableHead>
                <TableHead>Ketgan sana</TableHead>
                <TableHead>N-dars</TableHead>
                <TableHead>Ketish sababi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j} className={j === 0 ? "border-r" : ""}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-16 text-muted-foreground"
                  >
                    Ma&apos;lumot yo&apos;q
                  </TableCell>
                </TableRow>
              ) : (
                pagedData.map((row, i) => (
                  <TableRow key={row.enrollmentId}>
                    <TableCell className="border-r text-muted-foreground">
                      {(clampedPage - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.studentName}
                    </TableCell>
                    <TableCell>{row.groupName}</TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.teacherChangeAt), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      {(row.previousTeachers.join(", ") || "—") +
                        " → " +
                        (row.newTeachers.join(", ") || "—")}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.departedAt), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.lessonNumber}-dars</Badge>
                    </TableCell>
                    <TableCell>{row.departureReason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={clampedPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
