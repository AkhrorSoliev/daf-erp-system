"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CircleDollarSign,
  UserMinus,
  UserPlus,
  Users,
  PencilLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

type EventKind =
  | "SalaryChanged"
  | "GroupAdded"
  | "GroupRemoved"
  | "GroupReplaced"
  | "ProfileUpdated";

interface TimelineEvent {
  kind: EventKind;
  at: string;
  by: { id: number; firstName: string; lastName: string } | null;
  summary: string;
  payload: Record<string, unknown>;
}

interface Props {
  teacherId: number;
}

const iconForKind = (kind: EventKind) => {
  switch (kind) {
    case "SalaryChanged":
      return CircleDollarSign;
    case "GroupAdded":
      return UserPlus;
    case "GroupRemoved":
      return UserMinus;
    case "GroupReplaced":
      return Users;
    default:
      return PencilLine;
  }
};

const colorForKind = (kind: EventKind) => {
  switch (kind) {
    case "SalaryChanged":
      return "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950";
    case "GroupAdded":
      return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950";
    case "GroupRemoved":
      return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950";
    case "GroupReplaced":
      return "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950";
    default:
      return "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800";
  }
};

/**
 * Merged-stream timeline tab for teacher profile pages. Shows salary
 * config changes, group assignment history, and profile updates in one
 * chronological feed sourced from `GET /salary/timeline/:userId`.
 */
export function TeacherTimelineTab({ teacherId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-timeline", teacherId],
    queryFn: () =>
      api
        .get<TimelineEvent[]>(`/salary/timeline/${teacherId}`)
        .then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Hech qanday muhim o&apos;zgarish topilmadi
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((e, i) => {
        const Icon = iconForKind(e.kind);
        const color = colorForKind(e.kind);
        return (
          <div
            key={`${e.kind}-${e.at}-${i}`}
            className="flex gap-3 items-start p-3 rounded-lg border"
          >
            <div className={`shrink-0 p-2 rounded-full ${color}`}>
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{e.summary}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(e.at), "dd.MM.yyyy, HH:mm:ss")}
                {e.by && (
                  <>
                    {" "}
                    •{" "}
                    <span>
                      {e.by.firstName} {e.by.lastName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
