"use client";

import Link from "next/link";
import { AlertTriangle, Loader2, ShieldCheck, UserX, X } from "lucide-react";
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
  type PlannedAbsenceKind,
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
  // Oldindan belgilash rejimi: davomat o'rniga bitta o'quvchini darhol
  // "kelmaydi" deb belgilash. true bo'lsa batch status tugmalari o'rniga
  // "Oldindan" boshqaruvi ko'rsatiladi.
  planningMode?: boolean;
  planSubmitting?: boolean;
  onSetStatus: (studentId: number, status: AttendanceStatus) => void;
  onSetNote: (studentId: number, note: string) => void;
  onToggleNote: () => void;
  onPlanMark?: (studentId: number, kind: PlannedAbsenceKind) => void;
  onPlanRemove?: (studentId: number) => void;
}

export function AttendanceStudentRow({
  index,
  student,
  entry,
  statusOptions,
  isAdmin,
  isLocked,
  isNoteOpen,
  planningMode = false,
  planSubmitting = false,
  onSetStatus,
  onSetNote,
  onToggleNote,
  onPlanMark,
  onPlanRemove,
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

        <Link
          href={`/students/profile/${student.studentId}`}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${student.firstName} ${student.lastName} profilini ochish`}
        >
          <Avatar className="size-9 sm:size-10">
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/students/profile/${student.studentId}`}
              className="truncate text-sm font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {student.firstName} {student.lastName}
            </Link>
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
            {/* Yakuniy davomat olayotganda: bu o'quvchi oldindan belgilanganini
                ko'rsatuvchi belgi (planning rejimida belgi alohida ko'rinadi). */}
            {!planningMode && student.plannedKind && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <ShieldCheck className="size-3" />
                    {student.plannedKind === "SABABLI"
                      ? "Oldindan: Sababli"
                      : "Oldindan: sababsiz"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {student.plannedBy
                    ? `${student.plannedBy.firstName} ${student.plannedBy.lastName} oldindan belgilagan.`
                    : "Oldindan belgilangan."}{" "}
                  Kerak bo&apos;lsa holatni o&apos;zgartiring.
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

        {planningMode ? (
          <PlanMarkInline
            student={student}
            planSubmitting={planSubmitting}
            onPlanMark={onPlanMark}
            onPlanRemove={onPlanRemove}
          />
        ) : (
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
        )}
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

/**
 * Oldindan belgilash boshqaruvi — davomat o'rniga bitta o'quvchini "kelmaydi"
 * deb darhol belgilash. Allaqachon belgilangan bo'lsa: belgi + o'chirish;
 * aks holda: ikki tugma (Sababli / Kelmaydi).
 */
function PlanMarkInline({
  student,
  planSubmitting,
  onPlanMark,
  onPlanRemove,
}: {
  student: StudentAttendance;
  planSubmitting: boolean;
  onPlanMark?: (studentId: number, kind: PlannedAbsenceKind) => void;
  onPlanRemove?: (studentId: number) => void;
}) {
  if (student.plannedKind) {
    const isSababli = student.plannedKind === "SABABLI";
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
            isSababli
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
              : "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400",
          )}
        >
          {isSababli ? (
            <ShieldCheck className="size-3.5" />
          ) : (
            <UserX className="size-3.5" />
          )}
          {isSababli ? "Sababli" : "Kelmaydi"}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={planSubmitting}
              onClick={() => onPlanRemove?.(student.studentId)}
              className="flex items-center justify-center rounded-lg border border-muted p-2 text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {planSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Oldindan belgilashni o&apos;chirish</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={planSubmitting}
        onClick={() => onPlanMark?.(student.studentId, "SABABLI")}
        className="flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
      >
        <ShieldCheck className="size-4" />
        Sababli
      </button>
      <button
        type="button"
        disabled={planSubmitting}
        onClick={() => onPlanMark?.(student.studentId, "SABABSIZ")}
        className="flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
      >
        <UserX className="size-4" />
        Kelmaydi
      </button>
    </div>
  );
}
