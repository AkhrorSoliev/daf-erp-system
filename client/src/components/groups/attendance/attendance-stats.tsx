"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import type { GroupData } from "@/hooks/use-edit-group";

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
}

interface StatsResponse {
  students: StudentStat[];
  totalLessons: number;
}

interface AttendanceStatsProps {
  group: GroupData;
  onBack: () => void;
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

export function AttendanceStats({ group, onBack }: AttendanceStatsProps) {
  const now = new Date();
  const defaultStart = group.startDate
    ? new Date(group.startDate)
    : new Date(now.getFullYear(), 0, 1);

  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(now);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" />
          Kunlar
        </Button>
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
            Davomat ma&apos;lumotlari mavjud emas
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.students.map((student, index) => (
                <TableRow key={student.id}>
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
                </TableRow>
              ))}
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
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
