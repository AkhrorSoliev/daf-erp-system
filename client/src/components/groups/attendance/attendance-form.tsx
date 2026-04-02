"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";

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
  status: Status;
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

/** All status options — admin+ sees all, teacher sees only first two */
const ALL_STATUS_OPTIONS: {
  value: Status;
  label: string;
  short: string;
  color: string;
  activeColor: string;
}[] = [
  {
    value: "PRESENT",
    label: "Keldi",
    short: "K",
    color: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400",
    activeColor: "bg-green-500 text-white border-green-500 dark:bg-green-600 dark:border-green-600",
  },
  {
    value: "ABSENT",
    label: "Kelmadi",
    short: "Km",
    color: "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400",
    activeColor: "bg-red-500 text-white border-red-500 dark:bg-red-600 dark:border-red-600",
  },
  {
    value: "LATE",
    label: "Kechikdi",
    short: "Kch",
    color: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
    activeColor: "bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:border-amber-600",
  },
  {
    value: "EXCUSED",
    label: "Sababli",
    short: "S",
    color: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400",
    activeColor: "bg-blue-500 text-white border-blue-500 dark:bg-blue-600 dark:border-blue-600",
  },
];

interface AttendanceFormProps {
  group: GroupData;
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

export function AttendanceForm({ group, date, onBack, onSaved }: AttendanceFormProps) {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.roles.some((r: { id: number }) => [1, 2, 3].includes(r.id)) ?? false;

  const statusOptions = isAdmin ? ALL_STATUS_OPTIONS : ALL_STATUS_OPTIONS.slice(0, 2);

  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [entries, setEntries] = useState<Map<number, AttendanceEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Format date for display
  const [y, m, d] = date.split("-");
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  const dayName = DAY_NAMES[dateObj.getDay()] ?? "";
  const formattedDate = `${d}.${m}.${y}, ${dayName}`;

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

    if (nowMinutes < start) return { status: "before" as const, message: `Dars ${group.lessonStartTime} da boshlanadi` };
    if (nowMinutes > end) return { status: "after" as const, message: `Dars vaqti tugagan (${group.lessonStartTime} – ${group.lessonEndTime})` };
    return { status: "during" as const, message: `Dars davom etmoqda (${group.lessonStartTime} – ${group.lessonEndTime})` };
  })();

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/attendance/${group.id}/date/${date}`);
      setStudents(data);

      const map = new Map<number, AttendanceEntry>();
      for (const s of data) {
        map.set(s.studentId, {
          studentId: s.studentId,
          status: s.status ?? "PRESENT",
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

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await api.post(`/attendance/${group.id}/date/${date}`, {
        entries: Array.from(entries.values()),
      });
      toast.success("Davomat muvaffaqiyatli saqlandi");
      onSaved();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Davomatni saqlashda xatolik yuz berdi",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Count summary
  const presentCount = Array.from(entries.values()).filter((e) => e.status === "PRESENT" || e.status === "LATE").length;
  const absentCount = Array.from(entries.values()).filter((e) => e.status === "ABSENT").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 size-4" />
            Orqaga
          </Button>
          <div>
            <h3 className="text-sm font-semibold">{formattedDate}</h3>
            <p className="text-xs text-muted-foreground">{group.name}</p>
          </div>
        </div>
        {!loading && students.length > 0 && (
          <div className="text-right text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">{presentCount} keldi</span>
            {" · "}
            <span className="text-red-600 dark:text-red-400">{absentCount} kelmadi</span>
            {" · "}
            <span>{students.length} jami</span>
          </div>
        )}
      </div>

      {/* Lesson time banner */}
      {lessonTimeInfo && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
            lessonTimeInfo.status === "during" && "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400",
            lessonTimeInfo.status === "before" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
            lessonTimeInfo.status === "after" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
          )}
        >
          <Clock className="size-4 shrink-0" />
          {lessonTimeInfo.message}
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <div className="ml-auto flex gap-1">
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
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
        <div className="space-y-1">
          {students.map((student, index) => {
            const entry = entries.get(student.studentId);
            return (
              <div
                key={student.studentId}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                  entry?.status === "ABSENT" && "border-red-100 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20",
                  entry?.status === "LATE" && "border-amber-100 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20",
                  entry?.status === "EXCUSED" && "border-blue-100 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20",
                  (!entry?.status || entry?.status === "PRESENT") && "border-transparent bg-transparent",
                )}
              >
                <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>
                <Avatar className="size-9 shrink-0">
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
                  <p className="truncate text-sm font-medium">
                    {student.firstName} {student.lastName}
                  </p>
                  {isAdmin && (
                    <Input
                      placeholder="Izoh..."
                      value={entry?.note ?? ""}
                      onChange={(e) => setNote(student.studentId, e.target.value)}
                      className="mt-1 h-7 text-xs"
                    />
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {statusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(student.studentId, opt.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        entry?.status === opt.value ? opt.activeColor : opt.color,
                      )}
                      title={opt.label}
                    >
                      {opt.short}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save button */}
      {!loading && students.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={submitting} className="min-w-32">
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </div>
      )}
    </div>
  );
}
