"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, BarChart3, Check, AlertTriangle, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import type { GroupData } from "@/hooks/use-edit-group";

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

interface LessonDate {
  date: string;
  dayName: string;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
}

interface AttendanceDateListProps {
  group: GroupData;
  onSelectDate: (date: string) => void;
  onShowStats: () => void;
}

export function AttendanceDateList({ group, onSelectDate, onShowStats }: AttendanceDateListProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dates, setDates] = useState<LessonDate[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const fetchDates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/attendance/${group.id}/dates`, {
        params: { month, year },
      });
      setDates(data);
    } catch {
      setDates([]);
    } finally {
      setLoading(false);
    }
  }, [group.id, month, year]);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  const goToPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNext = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  };

  const getDateStatus = (item: LessonDate) => {
    if (item.hasAttendance) return "taken";
    if (item.date < todayStr) return "missed";
    if (item.date === todayStr) return "today";
    return "future";
  };

  // Check if today is a lesson day and auto-open
  const todayLesson = dates.find((d) => d.date === todayStr);
  const isLessonTime = (() => {
    if (!todayLesson || !group.lessonStartTime || !group.lessonEndTime) return false;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = group.lessonStartTime.split(":").map(Number);
    const [eh, em] = group.lessonEndTime.split(":").map(Number);
    return nowMinutes >= sh * 60 + sm && nowMinutes <= eh * 60 + em;
  })();

  return (
    <div className="space-y-4">
      {/* Today's quick action */}
      {todayLesson && !todayLesson.hasAttendance && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border p-4",
            isLessonTime
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
          )}
        >
          <div>
            <p className="text-sm font-medium">
              Bugungi dars — {todayLesson.dayName}, {formatDate(todayStr)}
            </p>
            <p className="text-xs text-muted-foreground">
              {group.lessonStartTime} – {group.lessonEndTime}
              {!isLessonTime && " · Dars vaqti tugagan yoki hali boshlanmagan"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onSelectDate(todayStr)}
            variant={isLessonTime ? "default" : "outline"}
          >
            Davomat olish
          </Button>
        </div>
      )}

      {todayLesson && todayLesson.hasAttendance && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <div>
            <p className="text-sm font-medium">
              Bugungi dars — {todayLesson.dayName}, {formatDate(todayStr)}
            </p>
            <p className="text-xs text-muted-foreground">
              Davomat olingan: {todayLesson.presentCount}/{todayLesson.totalStudents} keldi
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSelectDate(todayStr)}>
            Tahrirlash
          </Button>
        </div>
      )}

      {/* Header: month nav + stats button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrev} className="size-8">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={goToNext} className="size-8">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onShowStats}>
              <BarChart3 className="mr-1.5 size-4" />
              Statistika
            </Button>
          </TooltipTrigger>
          <TooltipContent>Davr bo&apos;yicha davomat statistikasi</TooltipContent>
        </Tooltip>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : dates.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            Bu oyda dars kunlari mavjud emas
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead className="min-w-28">Sana</TableHead>
                <TableHead className="min-w-24">Kun</TableHead>
                <TableHead className="min-w-28">Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dates.map((item, index) => {
                const status = getDateStatus(item);
                return (
                  <TableRow
                    key={item.date}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      status === "today" && "bg-blue-50 dark:bg-blue-950/30",
                    )}
                    onClick={() => onSelectDate(item.date)}
                  >
                    <TableCell className="border-r text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatDate(item.date)}
                    </TableCell>
                    <TableCell>{item.dayName}</TableCell>
                    <TableCell>
                      {status === "taken" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                          <Check className="size-4" />
                          {item.presentCount}/{item.totalStudents}
                        </span>
                      ) : status === "missed" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-4" />
                          Olinmagan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Minus className="size-4" />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
