"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface TeacherRow {
  id: number;
  name: string;
  groupCount: number;
  courses: string[];
  studentCount: number;
  totalPayments: number;
  debtAmount: number;
}

interface TeachersReportTableProps {
  branchId: number | null;
  startDate: string;
  endDate: string;
  onRowClick: (teacher: TeacherRow) => void;
}

function fmt(n: number): string {
  return n.toLocaleString("uz-UZ");
}

export function TeachersReportTable({
  branchId,
  startDate,
  endDate,
  onRowClick,
}: TeachersReportTableProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-payment-reports", branchId, startDate, endDate],
    queryFn: () =>
      api
        .get<{ teachers: TeacherRow[] }>("/reports/payment-reports/teachers", {
          params: {
            branchId: branchId ?? undefined,
            startDate,
            endDate,
          },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-base">O&apos;qituvchilar</h3>
        {isLoading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism familiya</TableHead>
              <TableHead className="text-center">Guruhlari</TableHead>
              <TableHead>Kurslar</TableHead>
              <TableHead className="text-center">Talabalar</TableHead>
              <TableHead className="text-right">Jami to&apos;lov</TableHead>
              <TableHead className="text-right">Qarzdorlik</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !data || data.teachers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  O&apos;qituvchilar topilmadi
                </TableCell>
              </TableRow>
            ) : (
              data.teachers.map((t, i) => (
                <TableRow
                  key={t.id}
                  onClick={() => onRowClick(t)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="border-r text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {t.groupCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {t.courses.slice(0, 2).map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                      {t.courses.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{t.courses.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {t.studentCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                    {fmt(t.totalPayments)} so&apos;m
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      t.debtAmount > 0
                        ? "text-red-600 dark:text-red-400 font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {fmt(t.debtAmount)} so&apos;m
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
