"use client";

/**
 * Ochilishi rejalashtirilgan (FORMING) guruhlar — jadvalda oddiy darslardan
 * punktir chiziq va shtrixli fon bilan ajralib turadi. Dars hisobiga,
 * davomatga va statistikaga qo'shilmaydi.
 */
import { CalendarClock, Users } from "lucide-react";
import { CanLink } from "@/components/shared/can-link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import type { DashboardLesson } from "./dashboard-daily-schedule";

export interface PlannedLesson {
  groupId: string;
  groupName: string;
  courseName: string | null;
  startTime: string | null;
  endTime: string | null;
  roomId: string | null;
  roomName: string | null;
  /** yyyy-MM-dd; null — sana hali belgilanmagan */
  startDate: string | null;
  teachers: { id: number; firstName: string; lastName: string }[];
  studentCount: number;
}

export const PLANNED_CARD_CLASS =
  "border-2 border-dashed border-yellow-500/70 bg-yellow-50 text-yellow-950 " +
  "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(234,179,8,0.12)_6px_12px)] " +
  "dark:border-yellow-600/60 dark:bg-yellow-950/20 dark:text-yellow-50 " +
  "hover:bg-yellow-100 dark:hover:bg-yellow-950/40";

type T = ReturnType<typeof useT>;

export function startLabel(p: PlannedLesson, t: T): string {
  return p.startDate
    ? t("Ochiladi {date}", { date: p.startDate.split("-").reverse().join(".") })
    : t("Sana belgilanmagan");
}

/** Gridga qo'yib bo'ladigan guruh: xona va vaqti bor. */
export function isPlacedPlanned(
  p: PlannedLesson,
): p is PlannedLesson & { startTime: string; endTime: string; roomId: string } {
  return !!p.roomId && !!p.startTime && !!p.endTime;
}

/** Joylashtirish algoritmi uchun DashboardLesson ko'rinishi. */
export function plannedAsLesson(p: PlannedLesson): DashboardLesson {
  return {
    groupId: p.groupId,
    groupName: p.groupName,
    courseName: p.courseName,
    startTime: p.startTime ?? "00:00",
    endTime: p.endTime ?? "00:00",
    roomId: p.roomId,
    roomName: p.roomName,
    teachers: p.teachers,
    studentCount: p.studentCount,
    presentCount: 0,
  };
}

function teacherName(p: PlannedLesson): string | null {
  const t = p.teachers[0];
  return t ? `${t.firstName} ${t.lastName[0]}.` : null;
}

export function PlannedBadge({ p }: { p: PlannedLesson }) {
  const t = useT();
  return (
    <span className="inline-flex max-w-full items-center rounded-sm bg-yellow-200/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100">
      <span className="truncate">
        {startLabel(p, t)}
        {p.studentCount > 0
          ? ` · ${t("{n} ta yozilgan", { n: p.studentCount })}`
          : ""}
      </span>
    </span>
  );
}

/** Grid ichidagi karta (absolute joylashuvni ota komponent beradi). */
export function PlannedGridCard({
  p,
  height,
}: {
  p: PlannedLesson;
  height: number;
}) {
  const t = useT();
  const teacher = teacherName(p);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CanLink
          perm="groups.view"
          href={`/groups/${p.groupId}`}
          className={`block h-full overflow-hidden rounded-md transition-colors ${PLANNED_CARD_CLASS}`}
        >
          <div className="flex h-full min-h-0 flex-col gap-1 px-2 py-1.5">
            <span className="w-fit rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-foreground">
              {p.startTime}-{p.endTime}
            </span>
            <p className="min-w-0 truncate text-[12px] font-semibold leading-tight">
              {p.groupName}
            </p>
            {height >= 58 && teacher && (
              <p className="min-w-0 truncate text-[10px] leading-tight text-muted-foreground">
                {teacher}
              </p>
            )}
            <div className="mt-auto min-w-0">
              <PlannedBadge p={p} />
            </div>
          </div>
        </CanLink>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <p className="font-medium">{p.groupName}</p>
          {p.courseName && <p className="text-xs">{p.courseName}</p>}
          <p className="text-xs">
            {p.startTime} – {p.endTime}
          </p>
          <p className="text-xs">{startLabel(p, t)}</p>
          <p className="text-xs">
            {t("Yozilgan: {n} ta", { n: p.studentCount })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Hali ochilmagan guruh — dars hisobiga kirmaydi")}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Ro'yxat: grid'ga sig'maganlar yoki «Ro'yxat» ko'rinishidagi hammasi. */
export function PlannedGroupsList({
  items,
  title,
}: {
  items: PlannedLesson[];
  title: string;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border-2 border-dashed border-yellow-500/50 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-900 dark:text-yellow-100">
        <CalendarClock className="size-4" />
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          ({items.length})
        </span>
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((p) => (
          <CanLink
            key={p.groupId}
            perm="groups.view"
            href={`/groups/${p.groupId}`}
            className={`flex min-w-[220px] flex-1 flex-col gap-1 rounded-md px-3 py-2 text-sm sm:flex-none ${PLANNED_CARD_CLASS}`}
          >
            <span className="font-semibold">{p.groupName}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {p.startTime && p.endTime
                ? `${p.startTime}-${p.endTime}`
                : t("Vaqti belgilanmagan")}
              {" · "}
              {p.roomName ?? t("Xona belgilanmagan")}
            </span>
            <span className="flex items-center gap-2">
              <PlannedBadge p={p} />
              {teacherName(p) && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="size-3" />
                  {teacherName(p)}
                </span>
              )}
            </span>
          </CanLink>
        ))}
      </div>
    </div>
  );
}
