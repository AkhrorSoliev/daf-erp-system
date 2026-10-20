"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditRoom } from "@/hooks/use-edit-room";
import { EditRoomDrawer } from "./edit-room-drawer";
import { RoomWeeklySchedule } from "./room-weekly-schedule";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import api from "@/lib/api";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { TranslatedStatusBadge } from "@/components/shared/translated-status-badge";

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface RoomGroup {
  id: string;
  name: string;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  statusEnum: string;
  course: { name: string };
  teachers: { teacher: Teacher }[];
}

interface RoomDetail {
  id: string;
  name: string;
  capacity: number | null;
  branchId: number;
  branch: {
    name: string;
    startOfWorkingDay: string | null;
    endOfWorkingDay: string | null;
  };
  groups: RoomGroup[];
}

const DAY_LABELS: Record<string, string> = {
  monday: msg("Du"),
  tuesday: msg("Se"),
  wednesday: msg("Cho"),
  thursday: msg("Pay"),
  friday: msg("Ju"),
  saturday: msg("Sha"),
  sunday: msg("Ya"),
};

export function RoomDetailClient({ roomId }: { roomId: string }) {
  const t = useT();
  const router = useRouter();
  const openDrawer = useEditRoom((s) => s.openDrawer);
  const setName = useBreadcrumbName((s) => s.setName);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data);
        setName(roomId, data.name);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchRoom();
  }, [roomId, setName]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("Xona topilmadi")}
        </h1>
        <p className="text-muted-foreground">
          {t("ID: {id} bo'yicha xona mavjud emas", { id: roomId })}
        </p>
      </div>
    );
  }

  // Flatten teachers for display
  const scheduleGroups = room.groups
    .filter((g) => g.lessonStartTime && g.lessonEndTime && g.exactDays.length > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      exactDays: g.exactDays,
      lessonStartTime: g.lessonStartTime,
      lessonEndTime: g.lessonEndTime,
      courseName: g.course?.name ?? null,
      teachers: g.teachers.map((gt) => gt.teacher),
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden sm:inline-flex"
              onClick={() => router.push("/settings/rooms")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Orqaga")}</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {room.name}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {room.branch.name}
            {room.capacity && ` • ${t("{n} o'rin", { n: room.capacity })}`}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openDrawer({
                  id: room.id,
                  name: room.name,
                  capacity: room.capacity,
                  branchId: room.branchId,
                  branchName: room.branch.name,
                })
              }
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              {t("Tahrirlash")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Xonani tahrirlash")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Dars jadvali */}
      <RoomWeeklySchedule
        groups={scheduleGroups}
        workingHours={{
          start: room.branch.startOfWorkingDay ?? "08:00",
          end: room.branch.endOfWorkingDay ?? "20:00",
        }}
      />

      {/* Biriktirilgan guruhlar */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t("Biriktirilgan guruhlar")}</h3>
          <Badge variant="outline" className="ml-auto">
            {t("{n} ta guruh", { n: room.groups.length })}
          </Badge>
        </div>

        {room.groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm">{t("Bu xonaga hali guruh biriktirilmagan")}</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>{t("Guruh nomi")}</TableHead>
                  <TableHead>{t("Kurs")}</TableHead>
                  <TableHead>{t("O'qituvchi")}</TableHead>
                  <TableHead>{t("Kunlar")}</TableHead>
                  <TableHead>{t("Vaqt")}</TableHead>
                  <TableHead>{t("Holati")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.groups.map((group, index) => (
                  <TableRow key={group.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.course.name}</TableCell>
                    <TableCell>
                      {group.teachers.length > 0
                        ? group.teachers
                            .map(
                              (gt) =>
                                `${gt.teacher.firstName} ${gt.teacher.lastName}`
                            )
                            .join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {group.exactDays.length > 0
                        ? group.exactDays
                            .map((d) => {
                              const day = DAY_LABELS[d];
                              return day ? t(day) : d;
                            })
                            .join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">
                      {group.lessonStartTime && group.lessonEndTime
                        ? `${group.lessonStartTime} – ${group.lessonEndTime}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <TranslatedStatusBadge entityType="groups" status={group.statusEnum} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EditRoomDrawer
        onSaved={(updated) =>
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  name: updated.name,
                  capacity: updated.capacity,
                }
              : prev
          )
        }
      />
    </div>
  );
}
