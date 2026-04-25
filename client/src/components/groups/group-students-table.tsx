"use client";

import Link from "next/link";
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
import { StudentRowActions } from "@/components/students/student-row-actions";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { Student } from "@/data/student-model";

export interface GroupStudent {
  enrollmentId: string;
  enrolledAt: string;
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  balance: number;
  isActive: boolean;
}

/** Map GroupStudent to minimal Student for StudentRowActions */
function toStudent(gs: GroupStudent): Student {
  return {
    id: gs.id,
    firstName: gs.firstName,
    lastName: gs.lastName,
    phone: gs.phone,
    photo: gs.photo,
    balance: gs.balance,
    isActive: gs.isActive,
    gender: null,
    date_of_birth: null,
    company_id: null,
    deleted_at: null,
    destroyer: null,
    comment: null,
    branches: [],
    groups: [],
    balance_on_period: null,
    extraPhone: null,
    parentPhone: null,
    parentName: null,
    telegram: null,
    telegramChatId: null,
    placeOfStudy: null,
    address: null,
    passportSeries: null,
    status: gs.isActive ? "ACTIVE" : "FROZEN",
    createdAt: "",
    updatedAt: "",
    lastTransactionType: null,
  };
}

function formatBalance(balance: number) {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = balance < 0 ? "-" : "";
  return `${sign}${abs} so'm`;
}

interface GroupStudentsTableProps {
  students: GroupStudent[];
  onStudentDeleted?: (id: number) => void;
}

export function GroupStudentsTable({ students, onStudentDeleted }: GroupStudentsTableProps) {
  const user = useAuth((s) => s.user);
  const canManage =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  if (students.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          Bu guruhda o&apos;quvchilar yo&apos;q
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 border-r">#</TableHead>
            <TableHead className="w-10">Rasm</TableHead>
            <TableHead className="min-w-30">Ism familiya</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">
              Telefon
            </TableHead>
            <TableHead className="min-w-28 text-right">Balans</TableHead>
            <TableHead className="hidden sm:table-cell">Holat</TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow
              key={student.enrollmentId}
              className="relative cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="border-r text-muted-foreground">
                {index + 1}
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
              <TableCell className="hidden sm:table-cell">
                {formatPhone(student.phone)}
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
                <Badge variant={student.isActive ? "default" : "secondary"}>
                  {student.isActive ? "Faol" : "Muzlatilgan"}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell className="relative z-10">
                  <StudentRowActions
                    student={toStudent(student)}
                    enrollmentId={student.enrollmentId}
                    onDeleted={onStudentDeleted}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
