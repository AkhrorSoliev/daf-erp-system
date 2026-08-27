"use client";

import Link from "next/link";
import {
  BookOpen,
  CaretRight,
  Headphones,
  Microphone,
  PencilSimple,
  Article,
} from "@phosphor-icons/react";
import {
  Screen,
  ScreenHeader,
  FadeIn,
  Card,
  Badge,
  IconTile,
  ProgressRing,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenLevels } from "./queries";
import type { LernenLevel } from "./types";

/**
 * Goethe imtihonining to'rt moduli — o'quv yo'lining MAQSADI.
 *
 * Hozir ularning bittasi ham ishlamaydi: Hören uchun audio va transkript
 * bor, savollar yo'q; Lesen matnlari manbalarda yo'q; Schreiben va
 * Sprechen AI baholashni talab qiladi. Shunga qaramay ular ekranda
 * ko'rinadi va holati rost aytiladi.
 *
 * Yashirilsa, o'quvchi grammatika mashqlarini nima uchun yechayotganini
 * bilmaydi. Ishlaydigandek ko'rsatilsa, bosilganda bo'sh ekran chiqadi.
 */
const SKILLS = [
  {
    key: "hoeren",
    label: "Hören",
    sub: "Tinglash",
    icon: Headphones,
    tone: "sky" as const,
  },
  {
    key: "lesen",
    label: "Lesen",
    sub: "O'qish",
    icon: Article,
    tone: "teal" as const,
  },
  {
    key: "schreiben",
    label: "Schreiben",
    sub: "Yozish",
    icon: PencilSimple,
    tone: "amber" as const,
  },
  {
    key: "sprechen",
    label: "Sprechen",
    sub: "Gapirish",
    icon: Microphone,
    tone: "coral" as const,
  },
];

function LevelCard({ level }: { level: LernenLevel }) {
  const lessons = level.units.reduce((n, u) => n + u.lessonCount, 0);
  const empty = level.units.length === 0;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={0}
          size={64}
          stroke={7}
          className="text-coral-500"
          label={
            <span className="font-display text-sm font-bold">
              {level.label}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-ink-900">
            {level.label}
          </p>
          <p className="text-sm font-semibold text-ink-500">
            {empty
              ? "Bu daraja uchun material hali qo'shilmagan"
              : `${level.units.length} bo'lim · ${lessons} dars`}
          </p>
        </div>
      </div>

      {empty ? null : (
        <div className="space-y-2">
          {level.units.map((u) => (
            <Link
              key={u.id}
              href={`/portal/lernen/units/${u.id}`}
              className="flex items-center gap-3 rounded-2xl bg-surface-sunk px-3.5 py-3 transition-colors hover:bg-ink-500/5"
            >
              <IconTile
                tone="grape"
                size="sm"
                icon={<BookOpen size={18} weight="bold" />}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">
                  {u.titleUz}
                </p>
                <p className="text-xs font-semibold text-ink-500">
                  {u.lessonCount} dars
                </p>
              </div>
              <CaretRight size={16} weight="bold" className="text-ink-400" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function LernenLevelsPage() {
  const { data, isLoading, isError } = useLernenLevels();

  return (
    <Screen>
      <ScreenHeader subtitle="Nemis tili" title="Ta'lim" />

      {isLoading ? (
        <LoadingCards count={3} />
      ) : isError || !data ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title="Ma'lumotni yuklab bo'lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko'ring."
        />
      ) : (
        <FadeIn className="space-y-4">
          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
              Poydevor
            </h2>
            {data.map((level) => (
              <LevelCard key={level.level} level={level} />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
              Imtihon yo&apos;nalishlari
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {SKILLS.map((s) => (
                <Card key={s.key} className="space-y-2 opacity-70">
                  <IconTile
                    tone={s.tone}
                    size="sm"
                    icon={<s.icon size={18} weight="bold" />}
                  />
                  <div>
                    <p className="font-display font-bold text-ink-900">
                      {s.label}
                    </p>
                    <p className="text-xs font-semibold text-ink-500">
                      {s.sub}
                    </p>
                  </div>
                  <Badge tone="neutral" size="sm">
                    Tez orada
                  </Badge>
                </Card>
              ))}
            </div>
          </section>
        </FadeIn>
      )}
    </Screen>
  );
}
