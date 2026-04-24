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

export interface DepartedStudentRow {
  id: string;
  student: { id: number; fullName: string };
  group: { id: string; name: string } | null;
  branch: { id: number; name: string } | null;
  course: { id: string; name: string } | null;
  teachers: { id: number; fullName: string }[];
  enrolledAt: string;
  departedAt: string | null;
  reason: string | null;
  departureReasonId: string | null;
}

const LINK_CLS =
  "hover:underline underline-offset-2 hover:text-foreground transition-colors";

const COLSPAN = 9;

interface Props {
  data: DepartedStudentRow[] | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
}

export function DepartedStudentsTable({ data, isLoading, page, pageSize }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-base">Ketgan o&apos;quvchilar ro&apos;yxati</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Kurs</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead>Chiqqan sana</TableHead>
              <TableHead>Sabab</TableHead>
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
                  Ketgan o&apos;quvchilar topilmadi
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
                        <Link href={`/groups/${row.group.id}`} className={LINK_CLS}>
                          {row.group.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.course?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.branch?.name ?? (
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
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {row.departedAt
                        ? format(new Date(row.departedAt), "dd.MM.yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm">
                      {row.reason || (
                        <span className="text-muted-foreground">—</span>
                      )}
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
