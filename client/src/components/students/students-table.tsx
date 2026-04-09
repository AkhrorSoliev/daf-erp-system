"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Student } from "@/data/student-model";
import { useAuth } from "@/hooks/use-auth";
import { StudentStatusBadge } from "./student-status-badge";
import { StudentRowActions } from "./student-row-actions";

function formatBalance(balance: number) {
  const abs = Math.abs(balance).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = balance < 0 ? "-" : "";
  return `${sign}${abs} so'm`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

interface StudentsTableProps {
  students: Student[];
  onDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, newStatus: string) => void;
}

export function StudentsTable({ students, onDeleted, onStatusChanged }: StudentsTableProps) {
  const user = useAuth((s) => s.user);
  const isTeacher = user?.roles.every((r) => r.id === 4) ?? false;

  if (students.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border">
        <Users className="text-muted-foreground/50 size-8" />
        <p className="text-muted-foreground text-sm">O&apos;quvchilar topilmadi</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card layout */}
      <div className="flex flex-col gap-3 sm:hidden">
        {students.map((student, index) => (
          <Link
            key={student.id}
            href={`/students/profile/${student.id}`}
            className="relative flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="text-muted-foreground mt-1 w-5 shrink-0 text-xs">
              {isTeacher ? `#${student.id}` : index + 1}
            </div>
            <AvatarWithPreview src={student.photo} alt={`${student.firstName} ${student.lastName}`}>
              <Avatar className="size-10 shrink-0">
                <AvatarImage
                  src={student.photo ?? undefined}
                  alt={`${student.firstName} ${student.lastName}`}
                />
                <AvatarFallback className="text-xs">
                  {student.firstName[0]}
                  {student.lastName[0]}
                </AvatarFallback>
              </Avatar>
            </AvatarWithPreview>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {student.firstName} {student.lastName}
                </span>
                <StudentStatusBadge student={student} />
              </div>
              <div className="text-muted-foreground text-sm">
                <a href={`tel:+998${student.phone}`} className="relative z-10 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {formatPhone(student.phone)}
                </a>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {student.groups.length > 0 ? (
                    student.groups.map((g) => (
                      <Badge key={g.id} variant="secondary" className="text-xs">
                        {g.level ?? g.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">Guruhsiz</span>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium",
                    student.balance < 0
                      ? "text-destructive"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  {formatBalance(student.balance)}
                </span>
              </div>
            </div>
            {!isTeacher && (
              <div className="relative z-10 shrink-0" onClick={(e) => e.preventDefault()}>
                <StudentRowActions
                  student={student}
                  onDeleted={onDeleted}
                  onStatusChanged={onStatusChanged}
                />
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-10">Rasm</TableHead>
              <TableHead className="min-w-30">Ism familiya</TableHead>
              <TableHead className="min-w-32">
                Telefon
              </TableHead>
              <TableHead className="hidden md:table-cell">Guruh</TableHead>
              <TableHead className="min-w-28 text-right">Balans</TableHead>
              <TableHead>Holat</TableHead>
              {!isTeacher && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student, index) => (
              <TableRow
                key={student.id}
                className="relative cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="border-r text-muted-foreground">
                  {isTeacher ? `#${student.id}` : index + 1}
                </TableCell>
                <TableCell>
                  <AvatarWithPreview src={student.photo} alt={`${student.firstName} ${student.lastName}`}>
                    <Avatar className="size-8">
                      <AvatarImage
                        src={student.photo ?? undefined}
                        alt={`${student.firstName} ${student.lastName}`}
                      />
                      <AvatarFallback className="text-xs">
                        {student.firstName[0]}
                        {student.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                  </AvatarWithPreview>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/students/profile/${student.id}`} className="absolute inset-0" />
                  {student.firstName} {student.lastName}
                </TableCell>
                <TableCell>
                  <a href={`tel:+998${student.phone}`} className="relative z-10 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {formatPhone(student.phone)}
                  </a>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex gap-1">
                    {student.groups.length > 0 ? (
                      student.groups.map((g) => (
                        <Badge key={g.id} variant="secondary">
                          {g.level ?? g.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium",
                    student.balance < 0
                      ? "text-destructive"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  {formatBalance(student.balance)}
                </TableCell>
                <TableCell>
                  <StudentStatusBadge student={student} />
                </TableCell>
                {!isTeacher && (
                  <TableCell className="relative z-10">
                    <StudentRowActions
                      student={student}
                      onDeleted={onDeleted}
                      onStatusChanged={onStatusChanged}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
