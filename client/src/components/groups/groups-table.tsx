"use client";

import Link from "next/link";
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
import { TranslatedStatusBadge } from "@/components/shared/translated-status-badge";
import { useT } from "@/i18n/context";
import { GroupRowActions } from "./group-row-actions";
import { LevelBadge } from "./level-badge";
import { CoveringBadge } from "./covering-badge";
import type { GroupData } from "@/hooks/use-edit-group";
import { useCan } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { isTeacherOnly } from "@/lib/teacher-only";
import { GroupsCards } from "./groups-cards";

import { formatWeekdays } from "@/lib/weekdays";

interface GroupsTableProps {
  groups: GroupData[];
  page?: number;
  pageSize?: number;
  onDeleted?: (id: string) => void;
  onStatusChanged?: (id: string, newStatus: string) => void;
}

export function GroupsTable({
  groups,
  page = 1,
  pageSize = 10,
  onDeleted,
  onStatusChanged,
}: GroupsTableProps) {
  const canManage = useCan("groups.manage");
  const user = useAuth((s) => s.user);
  const isMobile = useIsMobile();
  const t = useT();

  // A teacher on a phone gets cards: the table would hide their days, time,
  // room and student count (the Telegram cabinet opens on this list).
  if (isMobile && isTeacherOnly(user?.roles)) {
    return <GroupsCards groups={groups} />;
  }

  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
        {t("Guruhlar topilmadi")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-16 border-r">#</TableHead>
            <TableHead className="min-w-28">{t("Nomi")}</TableHead>
            <TableHead className="hidden min-w-32 sm:table-cell">
              {t("Daraja / Kurs")}
            </TableHead>
            <TableHead className="hidden min-w-28 md:table-cell">
              {t("O'qituvchi")}
            </TableHead>
            <TableHead className="hidden md:table-cell">{t("Xona")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("Kun / Vaqt")}</TableHead>
            <TableHead className="min-w-24">{t("Holat")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("O'quvchilar")}
            </TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, index) => {
            const groupStatusEnum = group.statusEnum || "FORMING";
            const daysLabel =
              group.exactDays?.length > 0
                ? formatWeekdays(group.exactDays, t)
                : null;
            const timeLabel =
              group.lessonStartTime && group.lessonEndTime
                ? `${group.lessonStartTime}–${group.lessonEndTime}`
                : group.lessonStartTime || null;

            return (
              <TableRow
                key={group.id}
                className="relative cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="border-r font-medium">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/groups/${group.id}`}
                    className="absolute inset-0"
                  />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{group.name}</span>
                    <CoveringBadge dates={group.coveringDates ?? []} />
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    {group.level && <LevelBadge level={group.level} />}
                    <span>{group.course.name}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {group.teachers.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {group.teachers.map((teacher) => {
                        const fullName = `${teacher.firstName} ${teacher.lastName}`;
                        const initials =
                          `${teacher.firstName[0] ?? ""}${teacher.lastName[0] ?? ""}`.toUpperCase();
                        return (
                          <div key={teacher.id} className="flex items-center gap-2">
                            <AvatarWithPreview src={teacher.photo} alt={fullName}>
                              <Avatar className="size-6">
                                <AvatarImage
                                  src={teacher.photo ?? undefined}
                                  alt={fullName}
                                />
                                <AvatarFallback className="text-[10px]">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            </AvatarWithPreview>
                            <span className="text-sm">{fullName}</span>
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
                  <TranslatedStatusBadge entityType="groups" status={groupStatusEnum} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {group.studentCount}
                </TableCell>
                {canManage && (
                  <TableCell className="relative z-10">
                    <GroupRowActions
                      group={group}
                      onDeleted={onDeleted}
                      onStatusChanged={onStatusChanged}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
