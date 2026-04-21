"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import type { GroupData } from "@/hooks/use-edit-group";

type DotStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;

interface Dot {
  date: string;
  status: DotStatus;
}

interface StudentSequence {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  dots: Dot[];
  attended: number;
  total: number;
}

interface SequenceResponse {
  lessonDates: string[];
  expectedCount: number;
  students: StudentSequence[];
}

interface AttendanceDotsTabProps {
  group: GroupData;
}

const STATUS_LABEL: Record<Exclude<DotStatus, null>, string> = {
  PRESENT: "Keldi",
  LATE: "Kech",
  EXCUSED: "Sababli",
  ABSENT: "Kelmadi",
};

function getDotClass(status: DotStatus): string {
  switch (status) {
    case "PRESENT":
      return "bg-emerald-500 border-emerald-500";
    case "LATE":
      return "bg-amber-500 border-amber-500";
    case "EXCUSED":
      return "bg-sky-400 border-sky-400";
    case "ABSENT":
      return "bg-red-500 border-red-500";
    default:
      return "border-dashed border-muted-foreground/50";
  }
}

function getPercentageColor(attended: number, expected: number): string {
  if (expected === 0) return "text-muted-foreground";
  const pct = (attended / expected) * 100;
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function AttendanceDots({
  dots,
  expectedCount,
}: {
  dots: Dot[];
  expectedCount: number;
}) {
  const placeholders = Math.max(0, expectedCount - dots.length);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {dots.map((dot, i) => {
        const statusLabel = dot.status
          ? STATUS_LABEL[dot.status]
          : "Belgilanmagan";
        return (
          <Tooltip key={`${dot.date}-${i}`}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-block size-3 rounded-full border",
                  getDotClass(dot.status),
                )}
                aria-label={`${format(new Date(dot.date + "T00:00:00"), "dd.MM.yyyy")} — ${statusLabel}`}
              />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium">
                {format(new Date(dot.date + "T00:00:00"), "dd.MM.yyyy")}
              </span>
              {" — "}
              {statusLabel}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {Array.from({ length: placeholders }).map((_, i) => (
        <Tooltip key={`placeholder-${i}`}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-block size-3 rounded-full border",
                getDotClass(null),
              )}
              aria-label="Kelajakdagi dars"
            />
          </TooltipTrigger>
          <TooltipContent>Kelajakdagi dars</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function AttendanceDotsTab({ group }: AttendanceDotsTabProps) {
  const [data, setData] = useState<SequenceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSequence = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/attendance/${group.id}/lesson-sequence`,
      );
      setData(data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    fetchSequence();
  }, [fetchSequence]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.students.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          Davomat ma&apos;lumotlari mavjud emas
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Belgilar:</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-emerald-500" />
            Keldi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-amber-500" />
            Kech
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-sky-400" />
            Sababli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-red-500" />
            Kelmadi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full border border-dashed border-muted-foreground/50" />
            Belgilanmagan / Kelajakdagi
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead className="w-10">Rasm</TableHead>
                <TableHead className="min-w-40">Ism familiya</TableHead>
                <TableHead className="min-w-60">
                  Darslar ketma-ketligi
                </TableHead>
                <TableHead className="w-20 text-center">Kelgan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.students.map((student, index) => (
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
                  <TableCell>
                    <AttendanceDots
                      dots={student.dots}
                      expectedCount={data.expectedCount}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-semibold",
                        getPercentageColor(
                          student.attended,
                          data.expectedCount,
                        ),
                      )}
                    >
                      {student.attended}/{data.expectedCount}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
