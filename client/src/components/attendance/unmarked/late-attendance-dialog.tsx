"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatLessonDay, type UnmarkedLessonRef } from "@/lib/unmarked-lesson";
import { AttendanceStudentRow } from "@/components/groups/attendance/attendance-student-row";
import {
  STATUS_CONFIG,
  type AttendanceEntry,
  type StudentAttendance,
} from "@/components/groups/attendance/attendance-form-utils";
import { markableStudents } from "@/components/groups/attendance/attendance-admission";

interface LateAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: UnmarkedLessonRef;
  canExempt: boolean;
  /** The teacher is already paid for this lesson (backfill or re-asked): no warning, no exemption box. */
  teacherPayExempt: boolean;
  onSaved: () => void;
}

/**
 * «Bo'ldi» — the register of a lesson nobody marked in time (spec §3.4). The
 * roster is who was in the group that day (`?late=1`). Saving leaves the
 * teacher unpaid for the lesson unless the CEO ticks the exemption.
 */
export function LateAttendanceDialog({
  open,
  onOpenChange,
  lesson,
  canExempt,
  teacherPayExempt,
  onSaved,
}: LateAttendanceDialogProps) {
  const [marks, setMarks] = useState<Map<number, AttendanceEntry>>(() => new Map());
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [exempt, setExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const roster = useQuery({
    queryKey: ["attendance-late-roster", lesson.groupId, lesson.date],
    queryFn: () =>
      api
        .get<{ activeStudents: StudentAttendance[] }>(`/attendance/${lesson.groupId}/date/${lesson.date}`, {
          params: { late: 1 },
        })
        .then((r) => r.data.activeStudents ?? []),
    enabled: open,
    // A reopened dialog must never offer an old roster: the server refuses a partial register.
    staleTime: 0,
  });
  const students = roster.data ?? [];
  // Contract 3.2 applies in «Bo'ldi» too: a student it keeps out of the lesson
  // can only be «Sababli» or left off, so «Barchasiga — Keldi» and the unmarked
  // count skip them (else the register could never be saved).
  const markable = markableStudents(students);

  const entryFor = (s: StudentAttendance): AttendanceEntry =>
    marks.get(s.studentId) ?? {
      studentId: s.studentId,
      status: s.plannedKind ? "EXCUSED" : null,
      note: s.plannedNote ?? undefined,
    };

  const update = (studentId: number, patch: Partial<AttendanceEntry>) => {
    const student = students.find((s) => s.studentId === studentId);
    if (!student) return;
    setMarks((prev) => new Map(prev).set(studentId, { ...entryFor(student), ...patch }));
  };

  const markAllPresent = () =>
    setMarks((prev) => {
      const next = new Map(prev);
      for (const s of markable) next.set(s.studentId, { ...entryFor(s), status: "PRESENT" });
      return next;
    });

  const reset = () => {
    setMarks(new Map());
    setOpenNote(null);
    setExempt(false);
    setExemptReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const unmarkedCount = markable.filter((s) => !entryFor(s).status).length;
  const reasonMissing = exempt && !exemptReason.trim();

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post<{ message?: string }>(`/attendance/${lesson.groupId}/date/${lesson.date}/late`, {
        // Only entries that have a status: a blocked student left unmarked would
        // otherwise go out as `status: null`, which the server's DTO refuses.
        entries: students.flatMap((s) => {
          const e = entryFor(s);
          return e.status ? [{ studentId: s.studentId, status: e.status, note: e.note }] : [];
        }),
        ...(exempt ? { teacherPayExempt: true, exemptReason: exemptReason.trim() } : {}),
      });
      toast.success(data?.message || "Davomat saqlandi");
      reset();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Davomatni saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  const time = lesson.startTime && lesson.endTime ? ` ${lesson.startTime}–${lesson.endTime}` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Dars bo&apos;ldi — kim keldi?</DialogTitle>
          <DialogDescription>
            {lesson.groupName}, {formatLessonDay(lesson.date)}
            {time}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {!exempt && !teacherPayExempt && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Davomat dars vaqtida olinmagan — ustozga bu dars uchun haq yozilmaydi.
            </div>
          )}

          {roster.isPending ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : roster.isError ? (
            <p className="text-sm text-destructive">O&apos;quvchilar ro&apos;yxatini yuklab bo&apos;lmadi</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">O&apos;sha kuni guruhda o&apos;quvchi bo&apos;lmagan</p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllPresent}
                disabled={submitting}
                className="text-green-700 dark:text-green-400"
              >
                <UserCheck className="mr-1.5 size-4" />
                Barchasiga — Keldi
              </Button>
              <div className="space-y-1.5">
                {students.map((student, index) => (
                  <AttendanceStudentRow
                    key={student.studentId}
                    index={index}
                    student={student}
                    entry={entryFor(student)}
                    statusOptions={STATUS_CONFIG}
                    isAdmin
                    isLocked={submitting}
                    isNoteOpen={openNote === student.studentId}
                    onSetStatus={(id, status) => update(id, { status })}
                    onSetNote={(id, note) => update(id, { note: note || undefined })}
                    onToggleNote={() => setOpenNote(openNote === student.studentId ? null : student.studentId)}
                  />
                ))}
              </div>
            </>
          )}

          {canExempt && !teacherPayExempt && (
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={exempt} onCheckedChange={(v) => setExempt(v === true)} />
                Ustoz aybdor emas — haq yozilsin
              </label>
              {exempt && (
                <Textarea
                  value={exemptReason}
                  onChange={(e) => setExemptReason(e.target.value)}
                  placeholder="Sabab: masalan, akkaunt hali ochilmagan edi"
                  maxLength={500}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {unmarkedCount > 0 && (
            <span className="mr-auto self-center text-xs font-medium text-amber-700 dark:text-amber-400">
              Belgilanmagan: {unmarkedCount} ta
            </span>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting || roster.isFetching || students.length === 0 || unmarkedCount > 0 || reasonMissing}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
