"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Info, MessageSquareText } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";

interface AttendanceNote {
  date: string;
  status: string;
  note: string;
  markedBy: string;
}

interface StudentStat {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
  notes: AttendanceNote[];
}

interface StatsResponse {
  students: StudentStat[];
  totalLessons: number;
}

interface AttendanceStatsProps {
  group: GroupData;
}

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPercentageColor(pct: number): string {
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PRESENT: { label: "Keldi", color: "text-green-600 dark:text-green-400" },
  ABSENT: { label: "Kelmadi", color: "text-red-600 dark:text-red-400" },
  LATE: { label: "Kechikdi", color: "text-amber-600 dark:text-amber-400" },
  EXCUSED: { label: "Sababli", color: "text-blue-600 dark:text-blue-400" },
};

const COL_COUNT = 9;

const GROUP_STATUS_LABELS: Record<string, string> = {
  FORMING: "Shakllanmoqda",
  PAUSED: "To'xtatilgan",
  COMPLETED: "Tugallangan",
  CANCELLED: "Bekor qilingan",
  ARCHIVED: "Arxivlangan",
};

export function AttendanceStats({ group }: AttendanceStatsProps) {
  const now = new Date();
  const defaultStart = group.startDate
    ? new Date(group.startDate)
    : new Date(now.getFullYear(), 0, 1);

  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(now);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const user = useAuth((s) => s.user);
  const isAdmin =
    user?.roles.some((r: { id: number }) => [1, 2, 3].includes(r.id)) ?? false;

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/attendance/${group.id}/stats`, {
        params: {
          startDate: formatDateParam(startDate),
          endDate: formatDateParam(endDate),
        },
      });
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [group.id, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Totals
  const totals = stats?.students.reduce(
    (acc, s) => ({
      present: acc.present + s.present,
      absent: acc.absent + s.absent,
      late: acc.late + s.late,
      excused: acc.excused + s.excused,
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  ) ?? { present: 0, absent: 0, late: 0, excused: 0 };

  const totalAttended = totals.present + totals.late;
  const totalPossible = (stats?.totalLessons ?? 0) * (stats?.students.length ?? 0);
  const overallPercentage = totalPossible > 0 ? Math.round((totalAttended / totalPossible) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <DatePicker
            value={startDate}
            onChange={(d) => d && setStartDate(d)}
            placeholder="Boshlanish"
          />
          <span className="text-sm text-muted-foreground">—</span>
          <DatePicker
            value={endDate}
            onChange={(d) => d && setEndDate(d)}
            placeholder="Tugash"
          />
        </div>
        {stats && (
          <span className="ml-auto text-sm text-muted-foreground">
            Jami darslar: {stats.totalLessons}
          </span>
        )}
      </div>

      {/* Guruh faol emas banner */}
      {group.statusEnum !== "ACTIVE" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <Info className="size-4 shrink-0" />
          Guruh faol emas ({GROUP_STATUS_LABELS[group.statusEnum] ?? group.statusEnum})
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !stats || stats.students.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            {group.statusEnum !== "ACTIVE" && stats?.totalLessons === 0
              ? "Guruh hali boshlanmagan. Davomat ma\u2019lumotlari mavjud emas"
              : stats?.totalLessons === 0
                ? "Hali davomat olinmagan"
                : "Davomat ma\u2019lumotlari mavjud emas"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead className="w-10">Rasm</TableHead>
                <TableHead className="min-w-30">Ism familiya</TableHead>
                <TableHead className="w-16 text-center">Keldi</TableHead>
                <TableHead className="w-16 text-center">Kelmadi</TableHead>
                <TableHead className="w-16 text-center">Kechikdi</TableHead>
                <TableHead className="w-16 text-center">Sababli</TableHead>
                <TableHead className="w-16 text-center">Foiz</TableHead>
                {isAdmin && <TableHead className="w-12 text-center">Izoh</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.students.map((student, index) => {
                const hasNotes = isAdmin && student.notes.length > 0;
                const isExpanded = expandedId === student.id;

                return (
                  <>
                    <TableRow
                      key={student.id}
                      className={cn(
                        hasNotes && "cursor-pointer hover:bg-muted/60",
                        isExpanded && "bg-muted/40",
                      )}
                      onClick={() => {
                        if (hasNotes) setExpandedId(isExpanded ? null : student.id);
                      }}
                    >
                      <TableCell className="border-r text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <Avatar className="size-8">
                          <AvatarImage
                            src={student.photo ?? undefined}
                            alt={`${student.firstName} ${student.lastName}`}
                          />
                          <AvatarFallback className="text-xs">
                            {student.firstName[0]}
                            {student.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell className="text-center text-green-600 dark:text-green-400">
                        {student.present}
                      </TableCell>
                      <TableCell className="text-center text-red-600 dark:text-red-400">
                        {student.absent}
                      </TableCell>
                      <TableCell className="text-center text-amber-600 dark:text-amber-400">
                        {student.late}
                      </TableCell>
                      <TableCell className="text-center text-blue-600 dark:text-blue-400">
                        {student.excused}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-center font-semibold",
                          getPercentageColor(student.percentage),
                        )}
                      >
                        {student.percentage}%
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          {hasNotes ? (
                            <div className="flex items-center justify-center gap-0.5">
                              <Badge variant="secondary" className="gap-0.5 px-1.5 text-[11px] text-purple-600 dark:text-purple-400">
                                <MessageSquareText className="size-3" />
                                {student.notes.length}
                              </Badge>
                              <ChevronDown
                                className={cn(
                                  "size-3.5 text-muted-foreground transition-transform",
                                  isExpanded && "rotate-180",
                                )}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded notes row */}
                    {hasNotes && isExpanded && (
                      <TableRow key={`${student.id}-notes`} className="bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-50/50 dark:hover:bg-purple-950/20">
                        <TableCell colSpan={isAdmin ? COL_COUNT : COL_COUNT - 1} className="px-4 py-3">
                          <div className="space-y-2 pl-8">
                            {student.notes.map((n, i) => {
                              const sl = STATUS_LABELS[n.status];
                              return (
                                <div key={i} className="flex items-start gap-3 text-xs">
                                  <span className="shrink-0 font-medium text-muted-foreground">
                                    {format(new Date(n.date + "T00:00:00"), "dd.MM.yyyy")}
                                  </span>
                                  <span className={cn("shrink-0 font-medium", sl?.color)}>
                                    {sl?.label ?? n.status}
                                  </span>
                                  <span className="text-purple-700 dark:text-purple-300">
                                    {n.note}
                                  </span>
                                  <span className="ml-auto shrink-0 text-muted-foreground">
                                    — {n.markedBy}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {/* JAMI row */}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell className="border-r" />
                <TableCell />
                <TableCell className="font-semibold">JAMI</TableCell>
                <TableCell className="text-center text-green-600 dark:text-green-400">
                  {totals.present}
                </TableCell>
                <TableCell className="text-center text-red-600 dark:text-red-400">
                  {totals.absent}
                </TableCell>
                <TableCell className="text-center text-amber-600 dark:text-amber-400">
                  {totals.late}
                </TableCell>
                <TableCell className="text-center text-blue-600 dark:text-blue-400">
                  {totals.excused}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-center font-semibold",
                    getPercentageColor(overallPercentage),
                  )}
                >
                  {overallPercentage}%
                </TableCell>
                {isAdmin && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
