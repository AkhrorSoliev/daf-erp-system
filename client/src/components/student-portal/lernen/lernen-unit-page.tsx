"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Stagger,
  CategoryCard,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenUnit } from "./queries";
import type { LernenLessonSummary } from "./types";

/**
 * Bo'lim — dizayn tizimidagi «Unit 1.1» ekrani.
 *
 * Maketda bo'lim kategoriyalarga bo'linadi (Video / Vocabulary /
 * Homework). Bizda video hali yo'q, shuning uchun ikkita haqiqiy
 * kategoriya: lug'at va grammatika.
 *
 * Darslar UZUN RO'YXAT bo'lib to'kilmaydi. Avvalgi versiya 26 ta bir xil
 * qatorni ketma-ket chiqarardi va o'quvchi qayerdan boshlashini
 * bilmasdi — aynan shu «chalkash» edi. Endi ular kategoriya ostida,
 * ikki ustunli to'rda, raqamlangan holda turadi.
 */
function lessonHref(lesson: LernenLessonSummary): string {
  return `/portal/lernen/lessons/${lesson.id}`;
}

export function LernenUnitPage({ unitId }: { unitId: number }) {
  const router = useRouter();
  const { data, isLoading, isError } = useLernenUnit(unitId);

  const vocab = data?.lessons.filter((l) => l.kind === "VOCAB") ?? [];
  const grammar = data?.lessons.filter((l) => l.kind === "GRAMMAR") ?? [];

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
        <Stagger className="space-y-4">
          <p className="px-1 text-sm font-semibold text-ink-500">
            {data.label} · {data.titleDe}
          </p>

          {vocab.length > 0 ? (
            <CategoryCard
              tone="mint"
              title="Lug'at"
              value={vocab.length}
              onClick={() => router.push(lessonHref(vocab[0]))}
            />
          ) : null}

          {grammar.length > 0 ? (
            <CategoryCard
              tone="grape"
              title="Grammatika"
              value={grammar.length}
              onClick={() => router.push(lessonHref(grammar[0]))}
            />
          ) : null}

          {[
            { title: "Lug'at darslari", items: vocab },
            { title: "Grammatika darslari", items: grammar },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <section key={group.title} className="space-y-2">
                <h2 className="px-1 font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                  {group.title}
                </h2>
                <div className="lumio-stagger grid grid-cols-2 gap-2.5">
                  {group.items.map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => router.push(lessonHref(l))}
                      style={{ ["--i" as string]: i } as React.CSSProperties}
                      className="flex flex-col gap-1 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-lumio-sm transition-transform active:translate-y-[2px] hover:-translate-y-0.5"
                    >
                      <span className="font-display text-xs font-bold text-ink-400">
                        {i + 1}
                      </span>
                      <span className="line-clamp-2 font-semibold leading-snug text-ink-900">
                        {l.titleUz ?? l.titleDe}
                      </span>
                      <span className="text-xs font-semibold text-ink-500">
                        {l.kind === "VOCAB"
                          ? `${l.wordCount} so'z`
                          : `${l.exerciseCount} mashq`}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </Stagger>
      )}
    </Screen>
  );
}
