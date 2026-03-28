"use client";

import { useRouter } from "next/navigation";
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

function formatBalance(balance: number) {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = balance < 0 ? "-" : "";
  return `${sign}${abs} so'm`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return phone;
}

interface GroupStudentsTableProps {
  students: GroupStudent[];
}

export function GroupStudentsTable({ students }: GroupStudentsTableProps) {
  const router = useRouter();

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow
              key={student.enrollmentId}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/students/profile/${student.id}`)}
            >
              <TableCell className="border-r text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell>
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
              </TableCell>
              <TableCell className="font-medium">
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
