"use client";

import * as React from "react";
import { BookOpen, SpeakerHigh } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  FadeIn,
  Card,
  Badge,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenLesson } from "./queries";
import { McExercise } from "./mc-exercise";
import type { LernenExercise, LernenLexeme } from "./types";

/** Turi bo'yicha nom — o'quvchi nima kelayotganini biladi. */
const KIND_LABEL: Record<LernenExercise["kind"], string> = {
  MC: "Variant tanlash",
  GAP: "Bo'sh joyni to'ldirish",
  CLOZE: "Matnni to'ldirish",
  REORDER: "So'zlarni tartiblash",
  FREE_WRITE: "Yozma topshiriq",
};

function LexemeRow({ lexeme }: { lexeme: LernenLexeme }) {
  const audio = React.useRef<HTMLAudioElement | null>(null);

  const play = () => {
    if (!lexeme.audioUrl) return;
    audio.current ??= new Audio(lexeme.audioUrl);
    void audio.current.play();
  };

  return (
    <div className="flex items-center gap-3 border-b border-ink-500/10 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-900">{lexeme.de}</p>
        <p className="text-sm font-semibold text-ink-500">
          {lexeme.uz ?? <span className="italic">tarjima tayyorlanmoqda</span>}
        </p>
      </div>
      {lexeme.audioUrl ? (
        <button
          type="button"
          onClick={play}
          aria-label="Tinglash"
          className="rounded-full bg-sky-500/12 p-2 text-sky-600 transition-colors hover:bg-sky-500/20"
        >
          <SpeakerHigh size={18} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Ishlamaydigan mashq turlari YASHIRILMAYDI.
 *
 * Kontent bor, dvigateli hali yo'q — buni aytish yashirishdan yaxshiroq, va
 * o'quvchi keyin nima kelishini ko'radi. Ochiq javobli mashq ham shu yerga
 * tushadi: uning bitta to'g'ri javobi yo'q, shuning uchun avtomatik
 * tekshirilmaydi.
 */
function NotYetExercise({
  exercise,
  index,
}: {
  exercise: LernenExercise;
  index: number;
}) {
  const open = exercise.answerStatus === "OPEN";

  return (
    <Card className="space-y-2 opacity-75">
      <p className="font-semibold text-ink-900">
        <span className="mr-2 text-ink-400">{index}.</span>
        {exercise.prompt}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral" size="sm">
          {KIND_LABEL[exercise.kind]}
        </Badge>
        <Badge tone={open ? "amber" : "neutral"} size="sm">
          {open ? "Bitta to'g'ri javobi yo'q" : "Tez orada"}
        </Badge>
      </div>
    </Card>
  );
}

export function LernenLessonPage({ lessonId }: { lessonId: number }) {
  const { data, isLoading, isError } = useLernenLesson(lessonId);

  const title = data ? (data.titleUz ?? data.titleDe) : "Dars";

  return (
    <Screen narrow>
      <StackHeader
        title={title}
        backHref={
          data ? `/portal/lernen/units/${data.unit.id}` : "/portal/lernen"
        }
      />

      {isLoading ? (
        <LoadingCards count={3} />
      ) : isError || !data ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Darsni yuklab bo'lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko'ring."
        />
      ) : (
        <FadeIn className="space-y-4">
          <p className="text-sm font-semibold text-ink-500">
            {data.label} · {data.unit.titleUz}
          </p>

          {data.grammar ? (
            <Card className="space-y-2">
              <p className="font-display text-lg font-bold text-ink-900">
                {data.grammar.titleUz ?? data.grammar.titleDe}
              </p>
              <p className="text-sm font-semibold leading-relaxed text-ink-600">
                {data.grammar.explanationUz ?? data.grammar.explanationEn}
              </p>
              {data.grammar.explanationUz ? null : (
                <Badge tone="neutral" size="sm">
                  Tarjima tayyorlanmoqda
                </Badge>
              )}
            </Card>
          ) : null}

          {data.lexemes.length > 0 ? (
            <Card>
              <p className="mb-1 font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                Lug&apos;at · {data.lexemes.length} so&apos;z
              </p>
              {data.lexemes.map((l) => (
                <LexemeRow key={l.id} lexeme={l} />
              ))}
            </Card>
          ) : null}

          {data.exercises.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                Mashqlar · {data.exercises.length}
              </h2>
              {data.exercises.map((ex, i) =>
                ex.kind === "MC" && ex.answerStatus !== "OPEN" ? (
                  <McExercise key={ex.id} exercise={ex} index={i + 1} />
                ) : (
                  <NotYetExercise key={ex.id} exercise={ex} index={i + 1} />
                ),
              )}
            </section>
          ) : null}
        </FadeIn>
      )}
    </Screen>
  );
}
