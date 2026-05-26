"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Eraser, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { WriteOffDebtDialog } from "./write-off-debt-dialog";

interface ClosedEnrollment {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  level: string | null;
  courseName: string | null;
  lessonPaymentCount: number;
  status: "DROPPED" | "FROZEN";
  statusChangedAt: string | null;
  statusChangeReason: string | null;
  enrolledAt: string;
  teachers: { id: number; firstName: string; lastName: string }[];
}

interface StudentClosedEnrollmentsSectionProps {
  studentId: number;
  // Section is rendered only when this is true — the profile passes
  // `student.balance < 0` from the parent so the section never appears
  // for students with no debt to clean up.
  visible: boolean;
  onWroteOff?: () => void;
}

const STATUS_LABEL: Record<"DROPPED" | "FROZEN", string> = {
  DROPPED: "Chiqarilgan",
  FROZEN: "Muzlatilgan",
};

export function StudentClosedEnrollmentsSection({
  studentId,
  visible,
  onWroteOff,
}: StudentClosedEnrollmentsSectionProps) {
  const [selected, setSelected] = useState<{
    enrollmentId: string;
    groupName: string;
  } | null>(null);

  const { data, isLoading, refetch } = useQuery<ClosedEnrollment[]>({
    queryKey: ["closed-enrollments", studentId],
    queryFn: () =>
      api
        .get<ClosedEnrollment[]>(`/students/${studentId}/closed-enrollments`)
        .then((r) => r.data),
    enabled: visible,
    staleTime: 30_000,
  });

  if (!visible) return null;

  if (isLoading) {
    return (
      <section className="mb-6">
        <SectionHeader />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return null; // student.balance < 0 but no closed enrollments — nothing to clean here
  }

  return (
    <section className="mb-6">
      <SectionHeader />

      <div className="grid gap-2">
        {data.map((e) => (
          <ClosedEnrollmentCard
            key={e.enrollmentId}
            enrollment={e}
            onWriteOffClick={() =>
              setSelected({
                enrollmentId: e.enrollmentId,
                groupName: e.groupName,
              })
            }
          />
        ))}
      </div>

      <WriteOffDebtDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        studentId={studentId}
        enrollmentId={selected?.enrollmentId ?? null}
        groupName={selected?.groupName ?? null}
        onSuccess={() => {
          refetch();
          onWroteOff?.();
        }}
      />
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Yopilgan guruhlar (qarzdorlik bilan)
      </h3>
      <span className="text-xs text-muted-foreground">
        Joriy siklda kelmagan o&apos;quvchi qarzini hisobdan chiqarish
      </span>
    </div>
  );
}

function ClosedEnrollmentCard({
  enrollment,
  onWriteOffClick,
}: {
  enrollment: ClosedEnrollment;
  onWriteOffClick: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-medium">{enrollment.groupName}</h4>
            <Badge variant="secondary" className="shrink-0">
              {STATUS_LABEL[enrollment.status]}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {enrollment.courseName ?? "—"}
              {enrollment.level && ` • ${enrollment.level}`}
            </span>
            {enrollment.teachers.length > 0 && (
              <span className="flex items-center gap-1">
                <UsersIcon className="size-3" />
                {enrollment.teachers
                  .map((t) => `${t.firstName} ${t.lastName}`)
                  .join(", ")}
              </span>
            )}
            {enrollment.statusChangedAt && (
              <span className="flex items-center gap-1">
                <CalendarIcon className="size-3" />
                {format(new Date(enrollment.statusChangedAt), "dd.MM.yyyy")}
              </span>
            )}
          </div>
          {enrollment.statusChangeReason && (
            <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-1">
              {enrollment.statusChangeReason}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-500/40 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
          onClick={onWriteOffClick}
        >
          <Eraser className="mr-1 size-3.5" />
          Qarzni chiqarish
        </Button>
      </div>
    </div>
  );
}
