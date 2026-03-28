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
import { GroupRowActions } from "./group-row-actions";
import type { GroupData } from "@/hooks/use-edit-group";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  1: { label: "Faol", variant: "default" },
  2: { label: "Boshlanmagan", variant: "secondary" },
  3: { label: "Pauza", variant: "outline" },
  4: { label: "To'xtatilgan", variant: "destructive" },
};

const DAYS_MAP: Record<string, string> = {
  odd: "Toq kunlar",
  even: "Juft kunlar",
};

interface GroupsTableProps {
  groups: GroupData[];
  page?: number;
  pageSize?: number;
  onDeleted?: (id: string) => void;
}

export function GroupsTable({ groups, page = 1, pageSize = 10, onDeleted }: GroupsTableProps) {
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
            <TableHead className="min-w-16 border-r">#</TableHead>
            <TableHead className="min-w-28">Nomi</TableHead>
            <TableHead className="hidden min-w-24 sm:table-cell">
              Kurs
            </TableHead>
            <TableHead className="hidden min-w-28 md:table-cell">
              O&apos;qituvchi
            </TableHead>
            <TableHead className="hidden md:table-cell">Xona</TableHead>
            <TableHead className="hidden lg:table-cell">Kun / Vaqt</TableHead>
            <TableHead className="min-w-24">Holat</TableHead>
            <TableHead className="hidden sm:table-cell">
              O&apos;quvchilar
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, index) => {
            const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];
            const daysLabel = group.days ? DAYS_MAP[group.days] : null;
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
                <TableCell className="border-r font-medium">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>{group.name}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {group.course.name}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {group.teachers.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {group.teachers.map((t) => {
                        const initials = t.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2);
                        return (
                          <div key={t.id} className="flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarImage src={t.photo ?? undefined} alt={t.name} />
                              <AvatarFallback className="text-[10px]">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{t.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {group.room?.name ?? "—"}
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
                <TableCell>
                  <GroupRowActions group={group} onDeleted={onDeleted} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
