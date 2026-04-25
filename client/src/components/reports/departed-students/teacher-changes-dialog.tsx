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
import {
  CHANGE_TYPE_LABELS,
  type RetentionQueryParams,
  type TeacherChangeRow,
} from "./teacher-change-types";

interface TeacherChangesDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryParams: RetentionQueryParams;
}

export function TeacherChangesDialog({
  open,
  onOpenChange,
  queryParams,
}: TeacherChangesDialogProps) {
  const { data, isLoading } = useQuery<TeacherChangeRow[]>({
    queryKey: ["teacher-changes-list", queryParams],
    queryFn: () =>
      api
        .get<TeacherChangeRow[]>(
          "/reports/departed-students/teacher-changes-list",
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
          <DialogTitle>Ustoz almashish hodisalari</DialogTitle>
          <DialogDescription>
            Tanlangan davrdagi barcha guruh ustoz o&apos;zgarishlari
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Oldingi ustoz</TableHead>
                <TableHead>Yangi ustoz</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>Sabab</TableHead>
                <TableHead>O&apos;zgartirgan</TableHead>
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
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(clampedPage - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {format(new Date(row.changedAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.groupName}
                    </TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell>
                      {row.previousTeachers.length > 0
                        ? row.previousTeachers.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.newTeachers.length > 0
                        ? row.newTeachers.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CHANGE_TYPE_LABELS[row.changeType]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.triggeredByDismissal ? (
                        <Badge variant="destructive">
                          Ustoz ishdan ketgan
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Oddiy o&apos;zgarish</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.changedBy ?? "—"}</TableCell>
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
