"use client";

import { BookOpen, ListChecks, Textbox } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  FadeIn,
  ListRow,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenUnit } from "./queries";
import type { LernenLessonSummary } from "./types";

function LessonRow({ lesson }: { lesson: LernenLessonSummary }) {
  const isVocab = lesson.kind === "VOCAB";
  const title = lesson.titleUz ?? lesson.titleDe;

  const parts = [
    isVocab ? `${lesson.wordCount} so'z` : "Grammatika",
    lesson.exerciseCount > 0 ? `${lesson.exerciseCount} mashq` : null,
  ].filter(Boolean);

  return (
    <ListRow
      href={`/portal/lernen/lessons/${lesson.id}`}
      icon={
        isVocab ? (
          <Textbox size={18} weight="bold" />
        ) : (
          <ListChecks size={18} weight="bold" />
        )
      }
      iconTone={isVocab ? "teal" : "grape"}
      label={title}
      subtitle={parts.join(" · ")}
    />
  );
}

export function LernenUnitPage({ unitId }: { unitId: number }) {
  const { data, isLoading, isError } = useLernenUnit(unitId);

  return (
    <Screen narrow>
      <StackHeader
        title={data?.titleUz ?? "Bo'lim"}
        backHref="/portal/lernen"
      />

      {isLoading ? (
        <LoadingCards count={3} />
      ) : isError || !data ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Bo'limni yuklab bo'lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko'ring."
        />
      ) : data.lessons.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Bu bo'limda dars yo'q"
          description="Material tez orada qo'shiladi."
        />
      ) : (
        <FadeIn className="space-y-3">
          <p className="text-sm font-semibold text-ink-500">
            {data.label} · {data.titleDe} · {data.lessons.length} dars
          </p>
          <div className="space-y-2">
            {data.lessons.map((l) => (
              <LessonRow key={l.id} lesson={l} />
            ))}
          </div>
        </FadeIn>
      )}
    </Screen>
  );
}
