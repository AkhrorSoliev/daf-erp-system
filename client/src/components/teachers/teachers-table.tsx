"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Teacher } from "@/data/teacher-model";
import { TeacherRowActions } from "./teacher-row-actions";

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

export function TeachersTable({ teachers }: { teachers: Teacher[] }) {
  const router = useRouter();

  if (teachers.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
        O&apos;qituvchilar topilmadi
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Rasm</TableHead>
            <TableHead className="min-w-36">Ism familiya</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">Telefon</TableHead>
            <TableHead className="hidden md:table-cell">Guruhlar soni</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map((teacher) => (
            <TableRow
              key={teacher.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/teachers/profile/${teacher.id}`)}
            >
              <TableCell>
                <Avatar className="size-8">
                  <AvatarImage
                    src={teacher.avatar}
                    alt={`${teacher.firstName} ${teacher.lastName}`}
                  />
                  <AvatarFallback className="text-xs">
                    {teacher.firstName[0]}
                    {teacher.lastName[0]}
                  </AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell className="font-medium">
                {teacher.firstName} {teacher.lastName}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {formatPhone(teacher.phone)}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {teacher.groups.length}
              </TableCell>
              <TableCell>
                <TeacherRowActions teacher={teacher} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
