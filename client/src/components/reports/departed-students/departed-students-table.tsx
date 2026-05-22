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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPhone } from "@/lib/format-utils";

export type DepartedStudentStatusFilter = "all" | "ACTIVE" | "FROZEN" | "EXPELLED";

export interface DepartedStudentRow {
  /** Student id as a string — used as the React key. */
  id: string;
  student: { id: number; fullName: string };
  phone: string;
  status: string;
  lastGroup: { id: string; name: string } | null;
  branch: { id: number; name: string } | null;
  course: { id: string; name: string } | null;
  teachers: { id: number; fullName: string }[];
  /** When the student lost their last group. */
  leftAt: string | null;
}

const LINK_CLS =
  "hover:underline underline-offset-2 hover:text-foreground transition-colors";

const COLSPAN = 10;

const STATUS_FILTER_OPTIONS: { value: DepartedStudentStatusFilter; label: string }[] =
  [
    { value: "all", label: "Barcha holatlar" },
    { value: "ACTIVE", label: "Faol (guruhsiz)" },
    { value: "FROZEN", label: "Muzlatilgan" },
    { value: "EXPELLED", label: "Chetlatilgan" },
  ];

interface Props {
  data: DepartedStudentRow[] | undefined;
  isLoading: boolean;
  page: number;
  pageSize: number;
  statusFilter: DepartedStudentStatusFilter;
  onStatusFilterChange: (next: DepartedStudentStatusFilter) => void;
}

export function DepartedStudentsTable({
  data,
  isLoading,
  page,
  pageSize,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b">
        <h3 className="font-semibold text-base">
          Ketgan o&apos;quvchilar ro&apos;yxati
        </h3>
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            onStatusFilterChange(v as DepartedStudentStatusFilter)
          }
        >
          <SelectTrigger className="h-9 w-auto min-w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead>Oxirgi guruh</TableHead>
              <TableHead>Kurs</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead>Guruhsiz qoldi</TableHead>
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
                  {statusFilter === "all"
                    ? "Ketgan o'quvchilar yo'q — barcha o'quvchilar biror guruhda o'qimoqda"
                    : "Bu holat bo'yicha ketgan o'quvchi topilmadi — boshqa holatni tanlang"}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => {
                const rowNumber = (page - 1) * pageSize + i + 1;
                const phoneDigits = row.phone?.replace(/\D/g, "") ?? "";
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
                    <TableCell className="tabular-nums text-sm">
                      {phoneDigits ? (
                        <a
                          href={`tel:+998${phoneDigits.slice(-9)}`}
                          className={LINK_CLS}
                        >
                          {formatPhone(row.phone)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge entityType="students" status={row.status} />
                    </TableCell>
                    <TableCell>
                      {row.lastGroup ? (
                        <Link
                          href={`/groups/${row.lastGroup.id}`}
                          className={LINK_CLS}
                        >
                          {row.lastGroup.name}
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
                      {row.leftAt
                        ? format(new Date(row.leftAt), "dd.MM.yyyy")
                        : "—"}
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
