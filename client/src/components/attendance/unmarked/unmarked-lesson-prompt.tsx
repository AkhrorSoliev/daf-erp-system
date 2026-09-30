"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  answerState,
  type AnswerState,
  type UnmarkedLessonInfo,
  type UnmarkedLessonRef,
} from "@/lib/unmarked-lesson";
import { LateAttendanceDialog } from "./late-attendance-dialog";
import { NotHeldDialog } from "./not-held-dialog";

export type UnmarkedDialog = "held" | "notHeld" | null;

// Same group-scoped keys the lesson-changes tab refreshes after a cancellation or
// reschedule; a prefix match covers every cached month.
const ANSWER_GROUP_KEYS = [
  "attendance-calendar",
  "attendance-dates",
  "attendance-lesson-sequence",
  "lesson-cancellations",
  "lesson-reschedules",
  "lesson-teacher-overrides",
] as const;

/** The two answers, plus who holds the task. */
export function UnmarkedLessonButtons({
  state,
  onPick,
}: {
  state: AnswerState;
  onPick: (dialog: Exclude<UnmarkedDialog, null>) => void;
}) {
  return (
    <>
      <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">Dars bo&apos;ldimi?</span>
      {state.heldBy && <span className="text-[11px] text-muted-foreground">{state.heldBy} javob bermoqda</span>}
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!state.canAnswer}
          onClick={() => onPick("held")}
          className="h-7 gap-1 px-2 text-xs text-green-700 dark:text-green-400"
        >
          <CheckCircle2 className="size-3.5" />
          Bo&apos;ldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!state.canAnswer}
          onClick={() => onPick("notHeld")}
          className="h-7 gap-1 px-2 text-xs text-red-700 dark:text-red-400"
        >
          <XCircle className="size-3.5" />
          Bo&apos;lmadi
        </Button>
      </div>
    </>
  );
}

/**
 * Both dialogs, driven by one state — mount them OUTSIDE any popover. An answer
 * refreshes every view that draws the lesson (schedule, calendar, dates, lesson
 * changes), so no surface keeps offering an answered question; `onAnswered` is
 * for what is specific to the caller.
 */
export function UnmarkedLessonDialogs({
  lesson,
  dialog,
  onDialogChange,
  canExempt,
  teacherPayExempt,
  onAnswered,
}: {
  lesson: UnmarkedLessonRef;
  dialog: UnmarkedDialog;
  onDialogChange: (dialog: UnmarkedDialog) => void;
  canExempt: boolean;
  /** `info.teacherPayExempt` of the question: the teacher is paid whatever is answered. */
  teacherPayExempt: boolean;
  onAnswered: () => void;
}) {
  const queryClient = useQueryClient();
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "today-schedule"] });
    for (const key of ANSWER_GROUP_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key, lesson.groupId] });
    }
    onDialogChange(null);
    onAnswered();
  };
  return (
    <>
      <LateAttendanceDialog
        open={dialog === "held"}
        onOpenChange={(o) => onDialogChange(o ? "held" : null)}
        lesson={lesson}
        canExempt={canExempt}
        teacherPayExempt={teacherPayExempt}
        onSaved={done}
      />
      <NotHeldDialog
        open={dialog === "notHeld"}
        onOpenChange={(o) => onDialogChange(o ? "notHeld" : null)}
        lesson={lesson}
        onDone={done}
      />
    </>
  );
}

/**
 * The open «Dars bo'ldimi?» bubble (spec 2026-09-29 §3.3). Draws nothing for
 * someone who may not see it — the caller falls back to its own badge.
 */
export function UnmarkedLessonPrompt({
  lesson,
  info,
  onAnswered,
  className,
}: {
  lesson: UnmarkedLessonRef;
  info: UnmarkedLessonInfo;
  onAnswered: () => void;
  className?: string;
}) {
  const user = useAuth((s) => s.user);
  const state = answerState(info, user);
  const [dialog, setDialog] = useState<UnmarkedDialog>(null);
  if (!state.visible) return null;
  return (
    <div
      className={cn(
        "inline-flex flex-col items-start gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-2 text-left shadow-sm dark:border-orange-800 dark:bg-orange-950/40",
        className,
      )}
    >
      <UnmarkedLessonButtons state={state} onPick={setDialog} />
      <UnmarkedLessonDialogs
        lesson={lesson}
        dialog={dialog}
        onDialogChange={setDialog}
        canExempt={state.canExempt}
        teacherPayExempt={info.teacherPayExempt}
        onAnswered={onAnswered}
      />
    </div>
  );
}
