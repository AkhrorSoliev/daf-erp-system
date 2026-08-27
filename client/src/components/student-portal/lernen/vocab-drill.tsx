"use client";

import * as React from "react";
import { CheckCircle, SpeakerHigh, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button, Card, ProgressBar } from "../lumio";
import { useCheckDrill, useLernenDrill } from "./queries";
import { useClipPlayer } from "./use-clip-player";
import type { DrillQuestion } from "./types";

const KIND_PROMPT: Record<DrillQuestion["kind"], string> = {
  AUDIO_TO_WORD: "Qaysi so'zni eshitdingiz?",
  WORD_TO_UZ: "Bu so'z nimani anglatadi?",
  UZ_TO_WORD: "Bu ma'noni qaysi so'z beradi?",
};

function Question({
  question,
  lessonId,
  onAnswered,
}: {
  question: DrillQuestion;
  lessonId: number;
  onAnswered: (correct: boolean) => void;
}) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const [startedAt] = React.useState(() => Date.now());
  const check = useCheckDrill();
  const play = useClipPlayer(question.audio);
  const result = check.data;

  // Tinglash savolida audio darhol o'ynaydi — savol audioning O'ZI, va
  // uni bosishni kutish savolni ko'rsatmay turishga teng.
  React.useEffect(() => {
    if (question.kind === "AUDIO_TO_WORD") play();
  }, [question.kind, play]);

  const submit = () => {
    if (!picked || result) return;
    check.mutate(
      {
        lessonId,
        index: question.index,
        given: picked,
        durationMs: Date.now() - startedAt,
      },
      { onSuccess: (r) => onAnswered(r.isCorrect) },
    );
  };

  return (
    <Card className="space-y-4">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-500">
        {KIND_PROMPT[question.kind]}
      </p>

      {question.kind === "AUDIO_TO_WORD" ? (
        <button
          type="button"
          onClick={play}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-sky-500/12 py-6 font-bold text-sky-600 transition-colors hover:bg-sky-500/20"
        >
          <SpeakerHigh size={28} weight="fill" />
          Yana eshitish
        </button>
      ) : (
        <p className="font-display text-2xl font-bold text-ink-900">
          {question.prompt}
        </p>
      )}

      <div className="space-y-2">
        {question.options.map((opt) => {
          const isPicked = picked === opt;
          const isRight = result !== undefined && opt === result.answer;
          const isWrongPick =
            result !== undefined && isPicked && !result.isCorrect;

          return (
            <button
              key={opt}
              type="button"
              disabled={result !== undefined}
              onClick={() => setPicked(opt)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-card border-2 px-4 py-3 text-left font-semibold transition-colors",
                "border-line bg-surface text-ink-800",
                isPicked && !result && "border-coral-500 bg-coral-500/10",
                isRight && "border-success bg-success/10 text-success",
                isWrongPick && "border-danger bg-danger/10 text-danger",
              )}
            >
              {isRight ? (
                <CheckCircle size={20} weight="fill" />
              ) : isWrongPick ? (
                <XCircle size={20} weight="fill" />
              ) : null}
              <span className="min-w-0 flex-1">{opt}</span>
            </button>
          );
        })}
      </div>

      {result ? null : (
        <Button
          onClick={submit}
          disabled={!picked || check.isPending}
          className="w-full"
        >
          {check.isPending ? "Tekshirilmoqda…" : "Tekshirish"}
        </Button>
      )}
    </Card>
  );
}

/**
 * Darsning mashq bosqichi.
 *
 * Savollar serverdan keladi va TO'G'RI JAVOBSIZ — mijoz uni bilmaydi.
 * Har javob serverga yuboriladi, natija shundan qaytadi.
 */
export function VocabDrill({
  lessonId,
  onFinished,
}: {
  lessonId: number;
  onFinished: (correct: number, total: number) => void;
}) {
  const { data, isLoading } = useLernenDrill(lessonId);
  const [at, setAt] = React.useState(0);
  const [correct, setCorrect] = React.useState(0);
  const [answered, setAnswered] = React.useState(false);

  if (isLoading || !data) {
    return <Card className="h-40 animate-pulse bg-tint" />;
  }
  if (data.length === 0) {
    return (
      <Card>
        <p className="font-semibold text-ink-600">
          Bu darsda hali mashq yo&apos;q — so&apos;zlar tarjima yoki audio
          kutmoqda.
        </p>
      </Card>
    );
  }

  const q = data[at];
  const last = at === data.length - 1;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm font-bold text-ink-500">
          <span>
            {at + 1} / {data.length}
          </span>
          <span>{correct} to&apos;g&apos;ri</span>
        </div>
        <ProgressBar value={(at / data.length) * 100} height={8} />
      </div>

      <Question
        key={q.index}
        question={q}
        lessonId={lessonId}
        onAnswered={(ok) => {
          if (ok) setCorrect((c) => c + 1);
          setAnswered(true);
        }}
      />

      {answered ? (
        <Button
          className="w-full"
          onClick={() => {
            setAnswered(false);
            if (last) onFinished(correct, data.length);
            else setAt((i) => i + 1);
          }}
        >
          {last ? "Yakunlash" : "Keyingisi"}
        </Button>
      ) : null}
    </div>
  );
}
