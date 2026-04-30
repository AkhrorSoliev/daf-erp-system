"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_TABLE_TOOLTIPS,
  formatAttendancePct,
  formatChangePct,
  getAttendanceColor,
  getChangeColor,
  type AttendanceCourseRow,
} from "./metric-helpers";

interface Props {
  courses: AttendanceCourseRow[];
  isLoading: boolean;
}

interface HeaderTooltipProps {
  label: string;
  tooltip: string;
  align?: "left" | "right";
}

function HeaderWithTooltip({
  label,
  tooltip,
  align = "left",
}: HeaderTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4",
            align === "right" && "block text-right",
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function AttendanceCoursesTable({ courses, isLoading }: Props) {
  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Kurs</TableHead>
              <TableHead className="text-right">Guruhlar</TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <HeaderWithTooltip
                  label="Boshi"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.startStudentCount}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Yakun"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.endStudentCount}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="O'zgarish"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.retention}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <HeaderWithTooltip
                  label="Darslar"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.lessonCount}
                  align="right"
                />
              </TableHead>
              <TableHead className="text-right hidden lg:table-cell text-emerald-600 dark:text-emerald-400">
                Keldi
              </TableHead>
              <TableHead className="text-right hidden lg:table-cell text-red-600 dark:text-red-400">
                Kelmadi
              </TableHead>
              <TableHead className="text-right">
                <HeaderWithTooltip
                  label="Davomat"
                  tooltip={ATTENDANCE_TABLE_TOOLTIPS.rate}
                  align="right"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r">
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : courses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground py-8"
                >
                  Tanlangan davrda kurs ma&apos;lumotlari yo&apos;q
                </TableCell>
              </TableRow>
            ) : (
              courses.map((c, i) => (
                <TableRow key={c.courseId}>
                  <TableCell className="border-r text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{c.courseName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.groupCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
                    {c.startStudentCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.endStudentCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-semibold",
                      getChangeColor(c.retentionPct),
                    )}
                  >
                    {formatChangePct(c.retentionPct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden md:table-cell">
                    {c.lessonCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden lg:table-cell text-emerald-700 dark:text-emerald-400">
                    {c.present}
                  </TableCell>
                  <TableCell className="text-right tabular-nums hidden lg:table-cell text-red-700 dark:text-red-400">
                    {c.absent}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-semibold",
                      getAttendanceColor(c.attendanceRate),
                    )}
                  >
                    {formatAttendancePct(c.attendanceRate)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
