"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CanLink } from "@/components/shared/can-link";
import api from "@/lib/api";
import { tashkentDayAsLocalDate } from "@/lib/tashkent-time";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";

type PastStatus = "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";

interface PastEnrollment {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  groupDeleted: boolean;
  level: string | null;
  courseName: string | null;
  status: PastStatus;
  startedAt: string;
  leftAt: string | null;
  reason: string | null;
  teachers: { id: number; firstName: string; lastName: string }[];
}

const STATUS_LABEL: Record<PastStatus, string> = {
  FROZEN: msg("Muzlatilgan"),
  COMPLETED: msg("Tugatgan"),
  DROPPED: msg("Chiqarilgan"),
  TRANSFERRED: msg("O'tkazilgan"),
};

const day = (instant: string) =>
  format(tashkentDayAsLocalDate(instant), "dd.MM.yyyy");

/**
 * Groups the student has left, under the active ones on the "Guruhlar" tab.
 * `GET /students/:id/past-enrollments` is `students.details`, so the caller
 * renders this only for that capability. Nothing renders when there are none.
 * `activeKey` (the active enrollment ids) refetches it when a transfer or a
 * removal changes the active list.
 */
export function StudentPastGroupsSection({
  studentId,
  activeKey,
}: {
  studentId: number;
  activeKey: string;
}) {
  const t = useT();
  const { data, isLoading } = useQuery<PastEnrollment[]>({
    queryKey: ["past-enrollments", studentId, activeKey],
    queryFn: () =>
      api
        .get<PastEnrollment[]>(`/students/${studentId}/past-enrollments`)
        .then((r) => r.data),
    staleTime: 30_000,
  });

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        {t("Oldingi guruhlar")}
      </h3>
      <div className="grid gap-2">
        {isLoading
          ? [1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))
          : data!.map((e) => <PastGroupCard key={e.enrollmentId} e={e} />)}
      </div>
    </section>
  );
}

function PastGroupCard({ e }: { e: PastEnrollment }) {
  const t = useT();
  const statusLabel = STATUS_LABEL[e.status];
  const name = <h4 className="truncate font-medium">{e.groupName}</h4>;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        {e.groupDeleted ? (
          name
        ) : (
          <CanLink
            perm="groups.view"
            href={`/groups/${e.groupId}`}
            linkClassName="min-w-0 hover:underline"
          >
            {name}
          </CanLink>
        )}
        <Badge variant="secondary" className="shrink-0">
          {t(statusLabel)}
        </Badge>
        {e.groupDeleted && (
          <Badge variant="outline" className="shrink-0">
            {t("Arxivlangan")}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {e.courseName ?? "—"}
          {e.level && ` • ${e.level}`}
        </span>
        {e.teachers.length > 0 && (
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3" />
            {e.teachers.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}
          </span>
        )}
        <span className="flex items-center gap-1">
          <CalendarIcon className="size-3" />
          {day(e.startedAt)}
          {e.leftAt && ` – ${day(e.leftAt)}`}
        </span>
      </div>
      {e.reason && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">
          {e.reason}
        </p>
      )}
    </div>
  );
}
