"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Group } from "@/data/groups-model";

const TYPE_LABELS: Record<Group["type"], string> = {
  standard: "Standart",
  intensive: "Intensiv",
};

export function GroupsTable({ groups }: { groups: Group[] }) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
        Guruhlar topilmadi
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-20">Raqami</TableHead>
            <TableHead className="min-w-24">Turi</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">
              Kurs davomiyligi
            </TableHead>
            <TableHead className="hidden md:table-cell">
              Boshlanish sanasi
            </TableHead>
            <TableHead className="hidden lg:table-cell">Darslar soni</TableHead>
            <TableHead className="hidden lg:table-cell">Xona</TableHead>
            <TableHead>O&apos;quvchilar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow
              key={group.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/groups/${group.id}`)}
            >
              <TableCell className="font-medium">
                {group.id.replace("DE-", "")}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    group.type === "intensive" ? "default" : "secondary"
                  }
                >
                  {TYPE_LABELS[group.type]}
                </Badge>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {group.courseDuration} oy
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {format(new Date(group.startDate), "dd.MM.yyyy")}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {group.lessonsCompleted}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {group.roomName}
              </TableCell>
              <TableCell>{group.studentCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
