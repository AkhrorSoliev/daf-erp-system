"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { StudentStatusBadge } from "./student-status-badge";
import { StudentRowActions } from "./student-row-actions";

function formatBalance(balance: number) {
  const abs = Math.abs(balance).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = balance < 0 ? "-" : "";
  return `${sign}${abs} so'm`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

export function StudentsTable({ students }: { students: Student[] }) {
  const router = useRouter();

  if (students.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
        O&apos;quvchilar topilmadi
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Rasm</TableHead>
            <TableHead className="min-w-30">Ism familiya</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">
              Telefon
            </TableHead>
            <TableHead className="hidden md:table-cell">Guruh</TableHead>
            <TableHead className="hidden lg:table-cell">
              {"O'qituvchi"}
            </TableHead>
            <TableHead className="hidden lg:table-cell">Dars sanasi</TableHead>
            <TableHead className="min-w-28 text-right">Balans</TableHead>
            <TableHead className="hidden sm:table-cell">Holat</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow
              key={student.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/student/profile/${student.id}`)}
            >
              <TableCell>
                <Avatar className="size-8">
                  <AvatarImage
                    src={student.avatar}
                    alt={`${student.firstName} ${student.lastName}`}
                  />
                  <AvatarFallback className="text-xs">
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell className="font-medium">
                {student.firstName} {student.lastName}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {formatPhone(student.phone)}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex gap-1">
                  {student.groups.map((g) => (
                    <Badge key={g.level} variant="secondary">
                      {g.level}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {student.teacher}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {format(new Date(student.lessonDate), "dd.MM.yyyy")}
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
              <TableCell className="hidden sm:table-cell">
                <StudentStatusBadge status={student.status} />
              </TableCell>
              <TableCell>
                <StudentRowActions studentId={student.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
