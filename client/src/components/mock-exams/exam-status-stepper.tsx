"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MOCK_EXAM_TRANSITION_INFO,
  type MockExamStatus,
} from "@/hooks/use-mock-exams-board";

const STEPS: { status: MockExamStatus; label: string }[] = [
  { status: "REGISTRATION_OPEN", label: "Ro'yxat ochiq" },
  { status: "REGISTRATION_CLOSED", label: "Ro'yxat yopiq" },
  { status: "GRADING", label: "Baholash" },
  { status: "ANNOUNCED", label: "E'lon qilingan" },
  { status: "ARCHIVED", label: "Arxiv" },
];

function indexOfStatus(status: MockExamStatus): number {
  return STEPS.findIndex((s) => s.status === status);
}

interface ExamStatusStepperProps {
  status: MockExamStatus;
  busy: boolean;
  onAdvance: () => void;
  onRollback: () => void;
}

export function ExamStatusStepper({
  status,
  busy,
  onAdvance,
  onRollback,
}: ExamStatusStepperProps) {
  const currentIdx = indexOfStatus(status);
  const isTerminal = currentIdx === STEPS.length - 1;
  const nextStep = currentIdx >= 0 ? STEPS[currentIdx + 1] : null;
  const forwardInfo = nextStep
    ? MOCK_EXAM_TRANSITION_INFO[status][nextStep.status]
    : null;

  // Rollback is whichever destructive transition the current state allows.
  const rollbackEntry = Object.entries(
    MOCK_EXAM_TRANSITION_INFO[status],
  ).find(([, info]) => info?.kind === "rollback");
  const rollbackInfo = rollbackEntry?.[1];

  return (
    <div className="rounded-lg border bg-card p-5">
      <ol className="flex items-start gap-2">
        {STEPS.map((step, idx) => {
          const state =
            idx < currentIdx || (idx === currentIdx && isTerminal)
              ? "done"
              : idx === currentIdx
                ? "current"
                : "future";
          const isLast = idx === STEPS.length - 1;
          return (
            <li
              key={step.status}
              className="flex min-w-0 flex-1 items-start gap-2"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums",
                    state === "done" &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    state === "current" &&
                      "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                    state === "future" &&
                      "border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-4" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={cn(
                    "max-w-[7rem] text-center text-[11px] leading-tight",
                    state === "current" && "font-semibold text-foreground",
                    state === "done" && "text-foreground/80",
                    state === "future" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "mt-3 h-0.5 flex-1 rounded",
                    idx < currentIdx
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/20",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {forwardInfo ? (
        <div className="mt-5 flex flex-col items-center gap-2 border-t pt-5">
          <p className="text-xs text-muted-foreground">
            {forwardInfo.description}
          </p>
          <Button
            size="lg"
            onClick={onAdvance}
            disabled={busy}
            className="min-w-[260px]"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Keyingi: {forwardInfo.label}
          </Button>
          {rollbackInfo && (
            <button
              type="button"
              onClick={onRollback}
              disabled={busy}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Yoki: {rollbackInfo.label}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 border-t pt-5 text-center text-xs text-muted-foreground">
          Imtihon jarayoni yakunlandi.
        </div>
      )}
    </div>
  );
}
