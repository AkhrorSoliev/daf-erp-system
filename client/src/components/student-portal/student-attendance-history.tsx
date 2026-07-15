"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Check, X, Clock, ShieldCheck, CloudSlash } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Card,
  Badge,
  ProgressRing,
  ProgressBar,
  EmptyState,
  LoadingCards,
  FadeIn,
} from "./lumio";
import type { AttendanceGroup, AttendanceStats } from "./lib/types";

const STATUS = {
  PRESENT: { label: "Keldi", icon: Check, tone: "success" as const, color: "var(--success)" },
  ABSENT: { label: "Kelmadi", icon: X, tone: "danger" as const, color: "var(--danger)" },
  LATE: { label: "Kechikdi", icon: Clock, tone: "warning" as const, color: "var(--warning)" },
  EXCUSED: { label: "Sababli", icon: ShieldCheck, tone: "sky" as const, color: "var(--ink-400)" },
} as const;

function percentColor(p: number): string {
  if (p >= 75) return "text-success";
  if (p >= 50) return "text-amber-600";
  return "text-danger";
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

const DAY_NAMES: Record<number, string> = {
  0: "Yak",
  1: "Du",
  2: "Se",
  3: "Cho",
  4: "Pay",
  5: "Ju",
  6: "Sha",
};

function StatCell({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-display text-xl font-extrabold"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-xs font-semibold text-ink-500">{label}</span>
    </div>
  );
}

export function StudentAttendanceHistory() {
  const { data, isLoading } = useQuery<AttendanceGroup[]>({
    queryKey: ["student-portal", "attendance-history"],
    queryFn: () =>
      api.get("/student-portal/attendance/history").then((r) => r.data),
  });
  const { data: stats } = useQuery<AttendanceStats>({
    queryKey: ["student-portal", "attendance-stats"],
    queryFn: () =>
      api.get("/student-portal/attendance/stats").then((r) => r.data),
  });

  return (
    <Screen>
      <StackHeader title="Davomat" backHref="/portal" />

      {isLoading ? (
        <LoadingCards count={2} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<CloudSlash weight="bold" />}
          title="Davomat ma'lumotlari yo'q"
          description="Darslar boshlanganda davomatingiz shu yerda ko'rinadi."
        />
      ) : (
        <>
          {/* Overall summary */}
          {stats && stats.total > 0 ? (
            <FadeIn index={0}>
              <Card clay tone="neutral" className="flex items-center gap-5">
                <ProgressRing
                  value={stats.percentage}
                  className={percentColor(stats.percentage)}
                  sublabel="davomat"
                />
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <StatCell value={stats.present} label="Keldi" color="var(--success)" />
                  <StatCell value={stats.late} label="Kechikdi" color="var(--warning)" />
                  <StatCell value={stats.absent} label="Kelmadi" color="var(--danger)" />
                  <StatCell value={stats.excused} label="Sababli" color="var(--ink-500)" />
                </div>
              </Card>
            </FadeIn>
          ) : null}

          {/* Per-group */}
          <div className="space-y-3">
            {data.map((group, gi) => (
              <FadeIn key={group.groupId} index={gi + 1}>
                <Card pad="none" className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-bold text-ink-900">
                        {group.groupName}
                      </h2>
                      <p className="truncate text-xs font-semibold text-ink-500">
                        {[group.courseName, group.lessonTime]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge tone={group.stats.percentage >= 75 ? "success" : group.stats.percentage >= 50 ? "warning" : "danger"}>
                      {group.stats.percentage}%
                    </Badge>
                  </div>

                  {group.stats.total > 0 ? (
                    <div className="px-4 pt-3">
                      <ProgressBar
                        segments={[
                          { value: group.stats.present, color: "var(--success)" },
                          { value: group.stats.late, color: "var(--warning)" },
                          { value: group.stats.absent, color: "var(--danger)" },
                          { value: group.stats.excused, color: "var(--ink-400)" },
                        ]}
                        height={10}
                      />
                    </div>
                  ) : null}

                  {group.records.length === 0 ? (
                    <p className="px-4 py-5 text-center text-xs font-semibold text-ink-500">
                      Hali davomat yozilmagan
                    </p>
                  ) : (
                    <div className="divide-y divide-line">
                      {group.records.map((record) => {
                        const cfg = STATUS[record.status];
                        const Icon = cfg.icon;
                        const dayName = DAY_NAMES[new Date(record.date).getDay()];
                        return (
                          <div
                            key={record.date}
                            className="flex items-center gap-3 px-4 py-2.5"
                          >
                            <div className="flex-1">
                              <span className="font-display text-sm font-bold text-ink-900">
                                {formatDate(record.date)}
                              </span>
                              <span className="ml-1.5 text-xs font-semibold text-ink-500">
                                {dayName}
                              </span>
                            </div>
                            <Badge tone={cfg.tone} size="sm">
                              <Icon size={13} weight="bold" />
                              {cfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </FadeIn>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
