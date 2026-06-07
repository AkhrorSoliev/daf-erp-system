"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
import {
  AttendanceDot,
  getDotClass,
  getPercentageColor,
  type DotStatus,
} from "@/components/shared/attendance-dot";

interface Dot {
  date: string;
  status: DotStatus;
  /** O'quvchi shu sanada guruhga a'zo bo'lganmi (backend coverage oynasi). */
  enrolled: boolean;
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
  overrideDates: string[];
  expectedCount: number;
  students: StudentSequence[];
}

interface AttendanceDotsTabProps {
  group: GroupData;
}

function AttendanceDots({
  dots,
  expectedCount,
  overrideDateSet,
}: {
  dots: Dot[];
  expectedCount: number;
  overrideDateSet: Set<string>;
}) {
  const placeholders = Math.max(0, expectedCount - dots.length);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dots.map((dot, i) => (
        <AttendanceDot
          key={`${dot.date}-${i}`}
          status={dot.status}
          date={dot.date}
          enrolled={dot.enrolled}
          hasOverride={overrideDateSet.has(dot.date)}
        />
      ))}
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
  // react-query so reschedule / cancellation / override mutations elsewhere
  // can `invalidateQueries(["attendance-lesson-sequence", id])` and refresh
  // this view automatically.
  const sequenceQuery = useQuery<SequenceResponse | null>({
    queryKey: ["attendance-lesson-sequence", group.id],
    queryFn: () =>
      api
        .get<SequenceResponse>(`/attendance/${group.id}/lesson-sequence`)
        .then((r) => r.data)
        .catch(() => null),
  });
  const data = sequenceQuery.data ?? null;
  const loading = sequenceQuery.isLoading;
  const overrideDateSet = new Set(data?.overrideDates ?? []);

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
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full border border-dotted border-muted-foreground/25 bg-muted/30 opacity-50" />
            Guruhda bo&apos;lmagan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full bg-emerald-500 ring-2 ring-blue-500/70 ring-offset-1 ring-offset-background" />
            O&apos;rinbosar ustoz
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
                    <Link
                      href={`/students/profile/${student.id}`}
                      className="inline-block shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${student.firstName} ${student.lastName} profilini ochish`}
                    >
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
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/students/profile/${student.id}`}
                      className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {student.firstName} {student.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <AttendanceDots
                      dots={student.dots}
                      expectedCount={data.expectedCount}
                      overrideDateSet={overrideDateSet}
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
