"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeacherData } from "@/hooks/use-edit-teacher";
import { TeacherRowActions } from "./teacher-row-actions";

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  if (phone.length === 9) {
    return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
  }
  return phone;
}

interface TeachersTableProps {
  teachers: TeacherData[];
  onDeleted?: (id: number) => void;
}

export function TeachersTable({ teachers, onDeleted }: TeachersTableProps) {
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
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead className="w-10">Rasm</TableHead>
            <TableHead className="min-w-36">Ism familiya</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">Telefon</TableHead>
            <TableHead className="hidden md:table-cell">Guruhlar</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map((teacher, index) => {
            const initials = teacher.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);

            return (
              <TableRow
                key={teacher.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/teachers/profile/${teacher.id}`)}
              >
                <TableCell className="border-r text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <AvatarWithPreview src={teacher.photo} alt={teacher.name}>
                    <Avatar className="size-8">
                      <AvatarImage
                        src={teacher.photo ?? undefined}
                        alt={teacher.name}
                      />
                      <AvatarFallback className="text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </AvatarWithPreview>
                </TableCell>
                <TableCell className="font-medium">
                  {teacher.name}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatPhone(teacher.phone)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {teacher.groupCount}
                </TableCell>
                <TableCell>
                  <TeacherRowActions teacher={teacher} onDeleted={onDeleted} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
