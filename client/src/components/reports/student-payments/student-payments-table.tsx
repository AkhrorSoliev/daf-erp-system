"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PaymentMethod } from "./student-payments-filter-bar";

const LINK_CLS =
  "hover:underline underline-offset-2 hover:text-foreground transition-colors";

export interface StudentPaymentRow {
  id: string;
  student: { id: number; fullName: string };
  group: { id: string; name: string } | null;
  teachers: { id: number; fullName: string }[];
  amount: number;
  bonus: number | null;
  paymentDate: string;
  note: string | null;
  receivedBy: { id: number; fullName: string } | null;
  method: PaymentMethod;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

interface Props {
  data: StudentPaymentRow[] | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
}

function fmt(n: number): string {
  return n.toLocaleString("uz-UZ");
}

const COLSPAN = 11;

export function StudentPaymentsTable({ data, isLoading, page, pageSize }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead className="text-right">To&apos;lov miqdori</TableHead>
              <TableHead className="text-right">Bonus</TableHead>
              <TableHead>To&apos;lov sanasi</TableHead>
              <TableHead>Izoh</TableHead>
              <TableHead>Qabul qilgan</TableHead>
              <TableHead>To&apos;lov turi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLSPAN}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLSPAN}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  To&apos;lovlar topilmadi
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => {
                const rowNumber = (page - 1) * pageSize + i + 1;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground tabular-nums">
                      {rowNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link
                        href={`/students/profile/${row.student.id}`}
                        className={LINK_CLS}
                      >
                        {row.student.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/students/profile/${row.student.id}`}
                        className={LINK_CLS}
                      >
                        {row.student.fullName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.group ? (
                        <Link
                          href={`/groups/${row.group.id}`}
                          className={LINK_CLS}
                        >
                          {row.group.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.teachers.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : row.teachers.length === 1 ? (
                        <Link
                          href={`/teachers/profile/${row.teachers[0].id}`}
                          className={LINK_CLS}
                        >
                          {row.teachers[0].fullName}
                        </Link>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={`/teachers/profile/${row.teachers[0].id}`}
                            className={LINK_CLS}
                          >
                            {row.teachers[0].fullName}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            +{row.teachers.length - 1}
                          </Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                      {fmt(row.amount)} so&apos;m
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.bonus === null ? "—" : `${fmt(row.bonus)} so'm`}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {format(new Date(row.paymentDate), "dd.MM.yyyy, HH:mm:ss")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {row.note || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.receivedBy ? (
                        row.receivedBy.fullName
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {METHOD_LABELS[row.method]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
