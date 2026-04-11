"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Clock,
  UserCheck,
  UserX,
  Check,
  X,
  AlarmClock,
  ShieldCheck,
  QrCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";
import { QrAttendanceDialog } from "./qr-attendance-dialog";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

interface StudentAttendance {
  studentId: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  status: Status | null;
  note: string | null;
}

interface AttendanceEntry {
  studentId: number;
  status: Status | null;
  note?: string;
}

const DAY_NAMES: Record<number, string> = {
  0: "Yakshanba",
  1: "Dushanba",
  2: "Seshanba",
  3: "Chorshanba",
  4: "Payshanba",
  5: "Juma",
  6: "Shanba",
};

const STATUS_CONFIG: {
  value: Status;
  label: string;
  icon: LucideIcon;
  color: string;
  activeColor: string;
  activeBg: string;
}[] = [
  {
    value: "PRESENT",
    label: "Keldi",
    icon: Check,
    color:
      "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30",
    activeColor:
      "border-green-500 bg-green-500 text-white dark:border-green-500 dark:bg-green-600",
    activeBg: "",
  },
  {
    value: "ABSENT",
    label: "Kelmadi",
    icon: X,
    color:
      "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30",
    activeColor:
      "border-red-500 bg-red-500 text-white dark:border-red-500 dark:bg-red-600",
    activeBg:
      "border-red-100 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20",
  },
  {
    value: "LATE",
    label: "Kechikdi",
    icon: AlarmClock,
    color:
      "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30",
    activeColor:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-500 dark:bg-amber-600",
    activeBg:
      "border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
  },
  {
    value: "EXCUSED",
    label: "Sababli",
    icon: ShieldCheck,
    color:
      "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30",
    activeColor:
      "border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-600",
    activeBg:
      "border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20",
  },
];

interface AttendanceFormProps {
  group: GroupData;
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

export function AttendanceForm({
  group,
  date,
  onBack,
  onSaved,
}: AttendanceFormProps) {
  const user = useAuth((s) => s.user);
  const isAdmin =
    user?.roles.some((r: { id: number }) => [1, 2, 3].includes(r.id)) ?? false;

  const statusOptions = isAdmin ? STATUS_CONFIG : STATUS_CONFIG.slice(0, 2);

  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [entries, setEntries] = useState<Map<number, AttendanceEntry>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);

  // Format date for display
  const [y, m, d] = date.split("-");
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  const dayName = DAY_NAMES[dateObj.getDay()] ?? "";
  const formattedDate = `${d}.${m}.${y}`;

  // Check lesson time
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = date === todayStr;

  const lessonTimeInfo = (() => {
    if (!isToday || !group.lessonStartTime || !group.lessonEndTime) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = group.lessonStartTime.split(":").map(Number);
    const [eh, em] = group.lessonEndTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;

    // Dars boshlanishidan 10 daqiqa oldin ochiladi
    const windowStart = start - 10;

    if (nowMinutes < windowStart)
      return {
        status: "before" as const,
        message: `Dars ${group.lessonStartTime} da boshlanadi. Davomat dars boshlanishidan 10 daqiqa oldin ochiladi`,
      };
    if (nowMinutes > end)
      return {
        status: "after" as const,
        message: `Dars vaqti tugagan (${group.lessonStartTime} – ${group.lessonEndTime}). Davomat olish yopilgan`,
      };
    return {
      status: "during" as const,
      message: `Dars davom etmoqda (${group.lessonStartTime} – ${group.lessonEndTime})`,
    };
  })();

  // Teacher uchun dars vaqtidan tashqarida formani bloklash
  const isLocked =
    !isAdmin &&
    lessonTimeInfo != null &&
    lessonTimeInfo.status !== "during";

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/attendance/${group.id}/date/${date}`);
      setStudents(data);

      const map = new Map<number, AttendanceEntry>();
      for (const s of data) {
        map.set(s.studentId, {
          studentId: s.studentId,
          status: s.status ?? null,
          note: s.note ?? undefined,
        });
      }
      setEntries(map);
    } catch {
      setStudents([]);
      setEntries(new Map());
    } finally {
      setLoading(false);
    }
  }, [group.id, date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const setStatus = (studentId: number, status: Status) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentId);
      next.set(studentId, { ...existing!, studentId, status });
      return next;
    });
  };

  const setNote = (studentId: number, note: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentId);
      next.set(studentId, { ...existing!, studentId, note: note || undefined });
      return next;
    });
  };

  const markAllPresent = () => {
    setEntries((prev) => {
      const next = new Map(prev);
      for (const student of students) {
        const existing = next.get(student.studentId);
        next.set(student.studentId, {
          ...existing!,
          studentId: student.studentId,
          status: "PRESENT",
        });
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await api.post(`/attendance/${group.id}/date/${date}`, {
        entries: Array.from(entries.values()).map((e) => ({
          ...e,
          status: e.status ?? "PRESENT",
        })),
      });
      toast.success("Davomat muvaffaqiyatli saqlandi");
      onSaved();
    } catch (err: unknown) {
      const message =
        (err as any)?.response?.data?.message ||
        "Davomatni saqlashda xatolik yuz berdi";
      toast.error(Array.isArray(message) ? message[0] : message);
    } finally {
      setSubmitting(false);
    }
  };

  // Count summary
  const presentCount = Array.from(entries.values()).filter(
    (e) => e.status === "PRESENT" || e.status === "LATE",
  ).length;
  const absentCount = Array.from(entries.values()).filter(
    (e) => e.status === "ABSENT",
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={submitting}
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Orqaga
          </Button>
          <div>
            <h3 className="text-sm font-semibold">
              {formattedDate}, {dayName}
            </h3>
            <p className="text-xs text-muted-foreground">{group.name}</p>
          </div>
        </div>

        {!loading && students.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
              <UserCheck className="size-3.5" />
              {presentCount}
            </span>
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <UserX className="size-3.5" />
              {absentCount}
            </span>
            <span className="text-muted-foreground">/ {students.length}</span>
          </div>
        )}
      </div>

      {/* Lesson time banner */}
      {lessonTimeInfo && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
            lessonTimeInfo.status === "during" &&
              "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400",
            lessonTimeInfo.status === "before" &&
              "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
            lessonTimeInfo.status === "after" &&
              "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
          )}
        >
          <Clock className="size-4 shrink-0" />
          {lessonTimeInfo.message}
        </div>
      )}

      {/* Quick actions */}
      {!loading && students.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllPresent}
                  disabled={isLocked}
                  className="text-green-700 dark:text-green-400"
                >
                  <UserCheck className="mr-1.5 size-4" />
                  Barchasiga — Keldi
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Barcha o&apos;quvchilarni &quot;Keldi&quot; deb belgilash
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQrDialogOpen(true)}
                  disabled={isLocked}
                  className="text-primary"
                >
                  <QrCode className="mr-1.5 size-4" />
                  QR davomat
                </Button>
              </TooltipTrigger>
              <TooltipContent>QR kod orqali davomat olish</TooltipContent>
            </Tooltip>
          </div>

          {/* Status legend */}
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            {statusOptions.map((opt) => (
              <span key={opt.value} className="flex items-center gap-1">
                <opt.icon
                  className={cn(
                    "size-3.5",
                    opt.value === "PRESENT" && "text-green-500",
                    opt.value === "ABSENT" && "text-red-500",
                    opt.value === "LATE" && "text-amber-500",
                    opt.value === "EXCUSED" && "text-blue-500",
                  )}
                />
                {opt.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <div className="ml-auto flex gap-1.5">
                <Skeleton className="h-9 w-16 rounded-lg" />
                <Skeleton className="h-9 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            Bu guruhda faol o&apos;quvchilar yo&apos;q
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {students.map((student, index) => {
            const entry = entries.get(student.studentId);
            const statusCfg = STATUS_CONFIG.find(
              (s) => s.value === entry?.status,
            );
            const rowBg = statusCfg?.activeBg ?? "";

            return (
              <div
                key={student.studentId}
                className={cn(
                  "rounded-lg border p-2.5 transition-colors sm:p-3",
                  rowBg,
                )}
              >
                {/* Main row */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  {/* Index */}
                  <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>

                  {/* Avatar */}
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

                  {/* Name + note preview */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {student.firstName} {student.lastName}
                    </p>
                    {isAdmin &&
                      entry?.note &&
                      expandedNote !== student.studentId && (
                        <p className="truncate text-[11px] text-purple-600 dark:text-purple-400">
                          {entry.note}
                        </p>
                      )}
                  </div>

                  {/* Status buttons */}
                  <div className="flex shrink-0 gap-1.5">
                    {statusOptions.map((opt) => (
                      <Tooltip key={opt.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                              setStatus(student.studentId, opt.value)
                            }
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

                    {/* Note toggle for admin */}
                    {isAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedNote(
                                expandedNote === student.studentId
                                  ? null
                                  : student.studentId,
                              )
                            }
                            className={cn(
                              "flex items-center justify-center rounded-lg border px-2 py-2 text-xs transition-colors",
                              expandedNote === student.studentId || entry?.note
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

                {/* Note input (expanded) */}
                {isAdmin && expandedNote === student.studentId && (
                  <div className="mt-2 pl-8 sm:pl-[4.25rem]">
                    <Input
                      placeholder="Izoh yozing..."
                      value={entry?.note ?? ""}
                      onChange={(e) =>
                        setNote(student.studentId, e.target.value)
                      }
                      className="h-8 text-xs"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save button */}
      {!loading && students.length > 0 && (
        <div className="sticky bottom-4 flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={submitting || isLocked}
            size="lg"
            className="min-w-36 shadow-lg"
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </div>
      )}

      {/* QR Davomat Dialog */}
      <QrAttendanceDialog
        groupId={group.id}
        groupName={group.name}
        date={date}
        open={qrDialogOpen}
        onOpenChange={setQrDialogOpen}
        onClose={fetchAttendance}
      />
    </div>
  );
}
