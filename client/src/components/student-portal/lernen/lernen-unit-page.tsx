"use client";

import Link from "next/link";
import {
  BookOpen,
  CaretRight,
  ListChecks,
  Textbox,
} from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  FadeIn,
  Card,
  IconTile,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenUnit } from "./queries";
import type { LernenLessonSummary } from "./types";

function LessonRow({ lesson }: { lesson: LernenLessonSummary }) {
  const isVocab = lesson.kind === "VOCAB";
  const title = lesson.titleUz ?? lesson.titleDe;

  return (
    <Link
      href={`/portal/lernen/lessons/${lesson.id}`}
      className="flex items-center gap-3 rounded-2xl bg-surface-sunk px-3.5 py-3 transition-colors hover:bg-ink-500/5"
    >
      <IconTile
        tone={isVocab ? "teal" : "grape"}
        size="sm"
        icon={
          isVocab ? (
            <Textbox size={18} weight="bold" />
          ) : (
            <ListChecks size={18} weight="bold" />
          )
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{title}</p>
        <p className="text-xs font-semibold text-ink-500">
          {isVocab ? `${lesson.wordCount} so'z` : "Grammatika"}
          {lesson.exerciseCount > 0 ? ` · ${lesson.exerciseCount} mashq` : null}
        </p>
      </div>
      <CaretRight size={16} weight="bold" className="text-ink-400" />
    </Link>
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
          <Card className="space-y-2">
            {data.lessons.map((l) => (
              <LessonRow key={l.id} lesson={l} />
            ))}
          </Card>
        </FadeIn>
      )}
    </Screen>
  );
}
