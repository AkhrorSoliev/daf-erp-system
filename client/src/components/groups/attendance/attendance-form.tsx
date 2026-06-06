"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Clock,
  UserCheck,
  UserX,
  Check,
  QrCode,
  CalendarClock,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";
import { QrAttendanceDialog } from "./qr-attendance-dialog";
import { AttendanceStudentRow } from "./attendance-student-row";
import { AttendanceDebtorsSection } from "./attendance-debtors-section";
import {
  DAY_NAMES,
  STATUS_CONFIG,
  type AttendanceEntry,
  type AttendanceStatus,
  type DebtorStudent,
  type PlannedAbsenceKind,
  type StudentAttendance,
} from "./attendance-form-utils";

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
  const [debtorStudents, setDebtorStudents] = useState<DebtorStudent[]>([]);
  const [coursePrice, setCoursePrice] = useState<number>(0);
  const [entries, setEntries] = useState<Map<number, AttendanceEntry>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  // Oldindan belgilash rejimida admin "Hozir to'liq davomat olish" bossa,
  // bu bayroq finalize rejimiga o'tkazadi.
  const [forceFinalizeMode, setForceFinalizeMode] = useState(false);
  const [planSubmitting, setPlanSubmitting] = useState<number | null>(null);

  const [y, m, d] = date.split("-");
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  const dayName = DAY_NAMES[dateObj.getDay()] ?? "";
  const formattedDate = `${d}.${m}.${y}`;

  // All time logic runs in Tashkent (UTC+5) — backend validates against the
  // same zone, so a teacher in Berlin sees the same banner as one in Tashkent.
  const tashkent = tashkentNow();
  const isToday = date === tashkent.dateStr;

  const lessonTimeInfo = (() => {
    if (!isToday || !group.lessonStartTime || !group.lessonEndTime) return null;
    const nowMinutes = tashkent.minutes;
    const [sh, sm] = group.lessonStartTime.split(":").map(Number);
    const [eh, em] = group.lessonEndTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;

    // Dars boshlanishidan 10 daqiqa oldin ochiladi
    const windowStart = start - 10;

    if (nowMinutes < windowStart)
      return {
        status: "before" as const,
        message: `Dars ${group.lessonStartTime} da boshlanadi (Toshkent vaqti). Davomat dars boshlanishidan 10 daqiqa oldin ochiladi`,
      };
    if (nowMinutes > end)
      return {
        status: "after" as const,
        message: `Dars vaqti tugagan (${group.lessonStartTime} – ${group.lessonEndTime}, Toshkent vaqti). Davomat olish yopilgan`,
      };
    return {
      status: "during" as const,
      message: `Dars davom etmoqda (${group.lessonStartTime} – ${group.lessonEndTime}, Toshkent vaqti)`,
    };
  })();

  // Teacher bir marta davomat olib saqlagan bo'lsa — qayta tahrirlab bo'lmaydi.
  // Faqat admin/direktor tahrirlay oladi.
  const alreadyTakenForTeacher =
    !isAdmin && students.some((s) => s.status !== null);

  const isLocked =
    alreadyTakenForTeacher ||
    (!isAdmin &&
      lessonTimeInfo != null &&
      lessonTimeInfo.status !== "during");

  // Oldindan belgilash konteksti: admin, davomat hali umuman olinmagan
  // (barcha real status null) va dars bugun yoki kelajakda. Bu holatda
  // admin to'liq ro'yxatni saqlamasdan, bitta o'quvchini oldindan
  // "kelmaydi" deb belgilab qo'yishi mumkin — ustoz qulflanmaydi.
  const isPlanningContext =
    isAdmin &&
    students.length > 0 &&
    students.every((s) => s.status === null) &&
    date >= tashkent.dateStr;
  const planningMode = isPlanningContext && !forceFinalizeMode;

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/attendance/${group.id}/date/${date}`);
      // Backend returns { activeStudents, debtorStudents?, perLessonCost?, coursePrice? }.
      // activeStudents now includes EVERYONE (teacher and admin alike) — debtors
      // appear inline with an indicator on the row, and the teacher must mark
      // them too. debtorStudents is still returned to admins as a quick-action
      // collection list rendered below the form.
      const active: StudentAttendance[] = data.activeStudents ?? [];
      const debtors: DebtorStudent[] = data.debtorStudents ?? [];
      setStudents(active);
      setDebtorStudents(debtors);
      setCoursePrice(data.coursePrice ?? 0);

      const map = new Map<number, AttendanceEntry>();
      for (const s of active) {
        // Oldindan belgilangan (lekin hali davomat olinmagan) o'quvchini
        // EXCUSED bilan urug'lantiramiz — yakuniy davomatda u "Sababli" bo'lib
        // turadi (pul yechilmaydi). Ustoz/admin baribir boshqa holatga
        // o'zgartira oladi (masalan o'quvchi kelib qolsa — "Keldi").
        const seededStatus: AttendanceStatus | null =
          s.status ?? (s.plannedKind ? "EXCUSED" : null);
        map.set(s.studentId, {
          studentId: s.studentId,
          status: seededStatus,
          note: s.note ?? s.plannedNote ?? undefined,
        });
      }
      setEntries(map);
    } catch {
      setStudents([]);
      setDebtorStudents([]);
      setCoursePrice(0);
      setEntries(new Map());
    } finally {
      setLoading(false);
    }
  }, [group.id, date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const setStatus = (studentId: number, status: AttendanceStatus) => {
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

  // Oldindan belgilash (pre-mark) — bitta o'quvchini darhol belgilaydi,
  // to'liq ro'yxat shart emas, ustoz qulflanmaydi.
  const planMark = async (studentId: number, kind: PlannedAbsenceKind) => {
    setPlanSubmitting(studentId);
    try {
      const { data } = await api.post(
        `/planned-absences/${group.id}/date/${date}`,
        { studentId, kind },
      );
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === studentId
            ? {
                ...s,
                plannedId: data.id,
                plannedKind: data.kind,
                plannedNote: data.note ?? null,
                plannedBy: data.createdBy ?? null,
              }
            : s,
        ),
      );
      // Keep the batch entry in sync so toggling to "Hozir to'liq davomat
      // olish" shows the pre-marked student as EXCUSED (Sababli) by default.
      setEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        if (!existing?.status) {
          next.set(studentId, { ...existing, studentId, status: "EXCUSED" });
        }
        return next;
      });
      toast.success("Oldindan belgilandi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Belgilashda xatolik yuz berdi"));
    } finally {
      setPlanSubmitting(null);
    }
  };

  const planRemove = async (studentId: number) => {
    const target = students.find((s) => s.studentId === studentId);
    if (!target?.plannedId) return;
    setPlanSubmitting(studentId);
    try {
      await api.delete(`/planned-absences/${target.plannedId}`);
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === studentId
            ? {
                ...s,
                plannedId: null,
                plannedKind: null,
                plannedNote: null,
                plannedBy: null,
              }
            : s,
        ),
      );
      // Clear the auto-seeded EXCUSED so a removed pre-mark doesn't leave the
      // student silently marked when finalizing. (Planning mode never exposes
      // batch buttons, so an EXCUSED here can only be the seed.)
      setEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(studentId);
        if (existing?.status === "EXCUSED") {
          next.set(studentId, { ...existing, studentId, status: null });
        }
        return next;
      });
      toast.success("Oldindan belgilash o'chirildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik yuz berdi"));
    } finally {
      setPlanSubmitting(null);
    }
  };

  const unmarkedStudents = students.filter((s) => {
    const entry = entries.get(s.studentId);
    return !entry?.status;
  });

  const handleSave = async () => {
    if (unmarkedStudents.length > 0) {
      toast.error(
        `Barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan: ${unmarkedStudents.length} ta`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/attendance/${group.id}/date/${date}`, {
        entries: Array.from(entries.values())
          .filter((e) => e.status !== null)
          .map((e) => ({
            studentId: e.studentId,
            status: e.status,
            note: e.note,
          })),
      });
      toast.success("Davomat muvaffaqiyatli saqlandi");
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Davomatni saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* Davomat olib bo'lingan — teacher uchun bloklangan holat */}
      {alreadyTakenForTeacher && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          <Check className="size-4 shrink-0" />
          Davomat olib bo&apos;lingan. Tahrirlash uchun administratorga murojaat
          qiling
        </div>
      )}

      {/* Lesson time banner */}
      {lessonTimeInfo && !alreadyTakenForTeacher && (
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

      {/* Oldindan belgilash rejimi banneri */}
      {!loading && planningMode && (
        <div className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0" />
            <span>
              Oldindan belgilash rejimi — bugun kelmaydigan o&apos;quvchini
              hozir belgilang. Dars vaqtida ustoz davomatni oladi; belgilangan
              o&apos;quvchilar &quot;Sababli&quot; bo&apos;lib turadi (pul
              yechilmaydi).
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setForceFinalizeMode(true)}
            className="shrink-0"
          >
            Hozir to&apos;liq davomat olish
          </Button>
        </div>
      )}

      {/* Quick actions */}
      {!loading && students.length > 0 && !planningMode && (
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
          {students.map((student, index) => (
            <AttendanceStudentRow
              key={student.studentId}
              index={index}
              student={student}
              entry={entries.get(student.studentId)}
              statusOptions={statusOptions}
              isAdmin={isAdmin}
              isLocked={isLocked}
              isNoteOpen={expandedNote === student.studentId}
              planningMode={planningMode}
              planSubmitting={planSubmitting === student.studentId}
              onSetStatus={setStatus}
              onSetNote={setNote}
              onToggleNote={() =>
                setExpandedNote(
                  expandedNote === student.studentId ? null : student.studentId,
                )
              }
              onPlanMark={planMark}
              onPlanRemove={planRemove}
            />
          ))}
        </div>
      )}

      {/* Save button */}
      {!loading && students.length > 0 && !alreadyTakenForTeacher && !planningMode && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 pt-2">
          {unmarkedStudents.length > 0 && !isLocked && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              Belgilanmagan: {unmarkedStudents.length} ta
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={submitting || isLocked || unmarkedStudents.length > 0}
            size="lg"
            className="min-w-36 shadow-lg"
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </div>
      )}

      {/* Admin-only debtors quick-action panel: same students already appear
          (with an inline "Qarz" badge) in the main roster above. This panel
          adds a "To'lov qabul qilish" shortcut so the admin can collect the
          full cycle in one click. After payment, retroactive billing settles
          all the unpaid attendance silently. */}
      {isAdmin && debtorStudents.length > 0 && (
        <AttendanceDebtorsSection
          debtors={debtorStudents}
          suggestedAmount={coursePrice}
          onPaymentSuccess={fetchAttendance}
        />
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
