"use client";

import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format-utils";
import {
  STATUS_CONFIG,
  type AttendanceEntry,
  type AttendanceStatus,
  type StatusOption,
  type StudentAttendance,
} from "./attendance-form-utils";

interface AttendanceStudentRowProps {
  index: number;
  student: StudentAttendance;
  entry: AttendanceEntry | undefined;
  statusOptions: StatusOption[];
  isAdmin: boolean;
  isLocked: boolean;
  isNoteOpen: boolean;
  onSetStatus: (studentId: number, status: AttendanceStatus) => void;
  onSetNote: (studentId: number, note: string) => void;
  onToggleNote: () => void;
}

export function AttendanceStudentRow({
  index,
  student,
  entry,
  statusOptions,
  isAdmin,
  isLocked,
  isNoteOpen,
  onSetStatus,
  onSetNote,
  onToggleNote,
}: AttendanceStudentRowProps) {
  const statusCfg = STATUS_CONFIG.find((s) => s.value === entry?.status);
  const rowBg = statusCfg?.activeBg ?? "";

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-colors sm:p-3",
        rowBg,
      )}
    >
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="w-5 text-center text-xs font-medium text-muted-foreground">
          {index + 1}
        </span>

        <Avatar className="size-9 shrink-0 sm:size-10">
          <AvatarImage
            src={student.photo ?? undefined}
            alt={`${student.firstName} ${student.lastName}`}
          />
          <AvatarFallback className="text-xs">
            {student.firstName[0]}
            {student.lastName[0]}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">
              {student.firstName} {student.lastName}
            </p>
            {student.isDebtor && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="size-3" />
                    Qarz
                    {typeof student.debtAmount === "number" &&
                      student.debtAmount > 0 && (
                        <span className="ml-0.5 font-mono tabular-nums">
                          {formatPrice(student.debtAmount)}
                        </span>
                      )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Balans manfiy. Davomat olinaveradi va har bir dars
                  uchun bahosi to&apos;g&apos;ridan-to&apos;g&apos;ri
                  balansdan ushlanmoqda. To&apos;lov kelganda
                  o&apos;tilgan darslar hisobi yopiladi.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {isAdmin && entry?.note && !isNoteOpen && (
            <p className="truncate text-[11px] text-purple-600 dark:text-purple-400">
              {entry.note}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          {statusOptions.map((opt) => (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onSetStatus(student.studentId, opt.value)}
                  className={cn(
                    "flex items-center justify-center rounded-lg border p-2 transition-all sm:p-2.5",
                    isLocked && "cursor-not-allowed opacity-50",
                    entry?.status === opt.value
                      ? opt.activeColor
                      : entry?.status === null
                        ? "border-muted text-muted-foreground hover:bg-muted/50"
                        : opt.color,
                  )}
                >
                  <opt.icon className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{opt.label}</TooltipContent>
            </Tooltip>
          ))}

          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleNote}
                  className={cn(
                    "flex items-center justify-center rounded-lg border px-2 py-2 text-xs transition-colors",
                    isNoteOpen || entry?.note
                      ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/30 dark:text-purple-400"
                      : "border-muted text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent>Izoh qo&apos;shish</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {isAdmin && isNoteOpen && (
        <div className="mt-2 pl-8 sm:pl-[4.25rem]">
          <Input
            placeholder="Izoh yozing..."
            value={entry?.note ?? ""}
            onChange={(e) => onSetNote(student.studentId, e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
