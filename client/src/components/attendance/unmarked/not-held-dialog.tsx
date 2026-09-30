"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { formatLessonDay, makeUpIsAhead, type UnmarkedLessonRef } from "@/lib/unmarked-lesson";

type Action = "CANCEL" | "RESCHEDULE";

interface NotHeldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: UnmarkedLessonRef;
  onDone: () => void;
}

/** «Bo'lmadi» — cancel (money back) or move to a later lesson (spec §3.5). */
export function NotHeldDialog({ open, onOpenChange, lesson, onDone }: NotHeldDialogProps) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<Action>("CANCEL");
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState(lesson.startTime ?? "");
  const [endTime, setEndTime] = useState(lesson.endTime ?? "");
  const [submitting, setSubmitting] = useState(false);

  const now = tashkentNow();
  const newDateStr = newDate ? format(newDate, "yyyy-MM-dd") : null;
  const makeUpProblem =
    action !== "RESCHEDULE"
      ? null
      : !newDateStr || !startTime || !endTime
        ? "Qo'shimcha dars sanasi va vaqtini tanlang"
        : endTime <= startTime
          ? "Tugash vaqti boshlanishdan keyin bo'lishi kerak"
          : !makeUpIsAhead(newDateStr, startTime, now)
            ? "Qo'shimcha dars hali boshlanmagan bo'lishi kerak"
            : null;
  const canSubmit = reason.trim().length > 0 && makeUpProblem === null && !submitting;

  const reset = () => {
    setReason("");
    setAction("CANCEL");
    setNewDate(undefined);
    setStartTime(lesson.startTime ?? "");
    setEndTime(lesson.endTime ?? "");
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/attendance/${lesson.groupId}/date/${lesson.date}/not-held`, {
        reason: reason.trim(),
        action,
        ...(action === "RESCHEDULE"
          ? { newDate: newDateStr, newLessonStartTime: startTime, newLessonEndTime: endTime }
          : {}),
      });
      toast.success(
        action === "CANCEL" ? "Dars bekor qilindi, o'quvchilarga pul qaytarildi" : "Dars boshqa kunga ko'chirildi",
      );
      reset();
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  const choice = (value: Action, title: string, hint: string, Icon: typeof Undo2) => (
    <button
      type="button"
      aria-pressed={action === value}
      onClick={() => setAction(value)}
      className={cn(
        "flex flex-1 items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
        action === value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );

  const time = lesson.startTime && lesson.endTime ? ` ${lesson.startTime}–${lesson.endTime}` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Dars bo&apos;lmadi</DialogTitle>
          <DialogDescription>
            {lesson.groupName}, {formatLessonDay(lesson.date)}
            {time}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nega bo'lmadi? (majburiy)"
            maxLength={500}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {choice("CANCEL", "Bekor qilish", "O'quvchilarga pul qaytadi", Undo2)}
            {choice("RESCHEDULE", "Boshqa kunga ko'chirish", "Qo'shimcha dars, pul qaytmaydi", CalendarClock)}
          </div>
          {action === "RESCHEDULE" && (
            <div className="space-y-2">
              <DatePicker
                value={newDate}
                onChange={setNewDate}
                minDate={new Date(`${now.dateStr}T00:00:00`)}
                placeholder="Qo'shimcha dars sanasi"
              />
              <div className="grid grid-cols-2 gap-2">
                <TimePicker value={startTime} onChange={setStartTime} placeholder="Boshlanishi" />
                <TimePicker value={endTime} onChange={setEndTime} placeholder="Tugashi" />
              </div>
              {makeUpProblem && <p className="text-xs text-amber-700 dark:text-amber-400">{makeUpProblem}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
