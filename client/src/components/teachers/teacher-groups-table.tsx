"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GroupData } from "@/hooks/use-edit-group";

const STATUS_MAP: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  1: { label: "Faol", variant: "default" },
  2: { label: "Boshlanmagan", variant: "secondary" },
  3: { label: "Pauza", variant: "outline" },
  4: { label: "To'xtatilgan", variant: "destructive" },
};

import { formatWeekdays } from "@/lib/weekdays";

interface TeacherGroupsTableProps {
  groups: GroupData[];
}

export function TeacherGroupsTable({ groups }: TeacherGroupsTableProps) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          Guruhlar hali ulanmagan
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-12 border-r">#</TableHead>
            <TableHead className="min-w-28">Nomi</TableHead>
            <TableHead className="hidden min-w-24 sm:table-cell">Kurs</TableHead>
            <TableHead className="hidden lg:table-cell">Kun / Vaqt</TableHead>
            <TableHead className="min-w-24">Holat</TableHead>
            <TableHead className="hidden sm:table-cell">O&apos;quvchilar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, index) => {
            const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];
            const daysLabel = group.exactDays?.length > 0
              ? formatWeekdays(group.exactDays)
              : null;
            const timeLabel =
              group.lessonStartTime && group.lessonEndTime
                ? `${group.lessonStartTime}–${group.lessonEndTime}`
                : group.lessonStartTime || null;

            return (
              <TableRow
                key={group.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/groups/${group.id}`)}
              >
                <TableCell className="border-r font-medium">{index + 1}</TableCell>
                <TableCell>{group.name}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {group.course.name}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex flex-col text-sm">
                    {daysLabel && <span>{daysLabel}</span>}
                    {timeLabel && (
                      <span className="text-muted-foreground">{timeLabel}</span>
                    )}
                    {!daysLabel && !timeLabel && "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {group.studentCount}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
