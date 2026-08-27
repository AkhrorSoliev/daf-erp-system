"use client";

import * as React from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button, Card } from "../lumio";
import { useRecordAttempt } from "./queries";
import type { LernenExercise } from "./types";

export interface McExerciseProps {
  exercise: LernenExercise;
  index: number;
}

/**
 * Variant tanlash mashqi.
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q va bo'lishi ham mumkin emas — u serverdan
 * faqat javob yuborilgandan KEYIN keladi. Aks holda uni brauzerning
 * tarmoq oynasida ko'rish mumkin bo'lardi.
 *
 * Tekshiruvning o'zi ham bu yerda emas: variant serverga yuboriladi va
 * server «to'g'ri» yoki «xato» deb javob beradi. Sabab — keyin Android va
 * iOS ilovalari bo'ladi; qoida mijozda bo'lsa, u uch marta yozilardi va
 * uchtasi bir-biriga to'g'ri kelmay qolardi.
 */
export function McExercise({ exercise, index }: McExerciseProps) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const [startedAt] = React.useState(() => Date.now());
  const record = useRecordAttempt();
  const result = record.data;

  const submit = () => {
    if (!picked || result) return;
    record.mutate({
      exerciseId: exercise.id,
      given: picked,
      durationMs: Date.now() - startedAt,
    });
  };

  const correct = result?.correctAnswers?.[0] ?? null;

  return (
    <Card className="space-y-3">
      <p className="font-semibold text-ink-900">
        <span className="mr-2 text-ink-400">{index}.</span>
        {exercise.prompt}
      </p>

      <div className="space-y-2">
        {exercise.options.map((opt) => {
          const isPicked = picked === opt;
          const isRight = result !== undefined && opt === correct;
          const isWrongPick =
            result !== undefined && isPicked && !result.isCorrect;

          return (
            <button
              key={opt}
              type="button"
              disabled={result !== undefined}
              onClick={() => setPicked(opt)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2xl border-2 px-3.5 py-2.5 text-left font-semibold transition-colors",
                "border-transparent bg-surface-sunk text-ink-800",
                isPicked && !result && "border-coral-500 bg-coral-500/10",
                isRight && "border-success bg-success/10 text-success",
                isWrongPick && "border-danger bg-danger/10 text-danger",
                result !== undefined && "cursor-default",
              )}
            >
              {isRight ? (
                <CheckCircle size={18} weight="fill" />
              ) : isWrongPick ? (
                <XCircle size={18} weight="fill" />
              ) : null}
              <span className="min-w-0 flex-1">{opt}</span>
            </button>
          );
        })}
      </div>

      {result ? (
        <p
          className={cn(
            "text-sm font-bold",
            result.isCorrect ? "text-success" : "text-danger",
          )}
        >
          {result.isCorrect ? "To'g'ri!" : "Xato — to'g'ri javob belgilandi"}
        </p>
      ) : (
        <Button
          onClick={submit}
          disabled={!picked || record.isPending}
          className="w-full"
        >
          {record.isPending ? "Tekshirilmoqda…" : "Tekshirish"}
        </Button>
      )}

      {record.isError ? (
        <p className="text-sm font-semibold text-danger">
          Javobni yuborib bo&apos;lmadi. Qayta urinib ko&apos;ring.
        </p>
      ) : null}
    </Card>
  );
}
