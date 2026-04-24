"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
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

interface GroupRow {
  id: string;
  name: string;
  coursePrice: number;
  totalStudents: number;
  paidCount: number;
  debtorCount: number;
  totalPayments: number;
  debtAmount: number;
  expectedAmount: number;
}

interface TeacherGroupsResponse {
  teacher: { id: number; name: string };
  groups: GroupRow[];
}

interface TeacherGroupsDialogProps {
  teacherId: number | null;
  teacherName: string | null;
  branchId: number | null;
  startDate: string;
  endDate: string;
  onOpenChange: (open: boolean) => void;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function TeacherGroupsDialog({
  teacherId,
  teacherName,
  branchId,
  startDate,
  endDate,
  onOpenChange,
}: TeacherGroupsDialogProps) {
  const open = teacherId !== null;

  const { data, isLoading } = useQuery({
    queryKey: [
      "teacher-groups-report",
      teacherId,
      branchId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api
        .get<TeacherGroupsResponse>(
          `/reports/payment-reports/teachers/${teacherId}/groups`,
          {
            params: {
              branchId: branchId ?? undefined,
              startDate,
              endDate,
            },
          },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{teacherName ?? "O'qituvchi guruhlari"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            O&apos;qituvchi guruhlari bo&apos;yicha tanlangan davrdagi
            statistika
          </p>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : data.groups.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Bu o&apos;qituvchi uchun faol guruhlar topilmadi
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Guruh nomi</TableHead>
                  <TableHead className="text-right">Kurs narxi</TableHead>
                  <TableHead className="text-center">Jami o&apos;quvchi</TableHead>
                  <TableHead className="text-center">To&apos;laganlar</TableHead>
                  <TableHead className="text-center">Qarzdorlar</TableHead>
                  <TableHead className="text-right">Jami to&apos;lovlar</TableHead>
                  <TableHead className="text-right">Qarzdorlik</TableHead>
                  <TableHead className="text-right">Kutilgan summa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.groups.map((g, i) => (
                  <TableRow key={g.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/groups/${g.id}`}
                        className="hover:underline underline-offset-2 hover:text-foreground transition-colors"
                        onClick={() => onOpenChange(false)}
                      >
                        {g.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(g.coursePrice)} so&apos;m
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {g.totalStudents}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-green-600 dark:text-green-400">
                      {g.paidCount}
                    </TableCell>
                    <TableCell
                      className={`text-center tabular-nums ${
                        g.debtorCount > 0
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {g.debtorCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                      {fmt(g.totalPayments)} so&apos;m
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        g.debtAmount > 0
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {fmt(g.debtAmount)} so&apos;m
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmt(g.expectedAmount)} so&apos;m
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
