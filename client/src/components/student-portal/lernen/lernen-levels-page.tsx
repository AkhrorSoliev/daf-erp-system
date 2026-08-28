"use client";

import {
  BookOpen,
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
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenLevels } from "./queries";
import { LessonPath } from "./lesson-path";
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

function LevelSection({ level }: { level: LernenLevel }) {
  if (level.units.length === 0) {
    return (
      <section className="flex items-center justify-between px-1">
        <h2 className="font-display text-[22px] font-extrabold text-ink-900">
          {level.label}
        </h2>
        <Badge tone="neutral" size="sm">
          Material tayyorlanmoqda
        </Badge>
      </section>
    );
  }

  // Progress hali hisoblanmaydi: urinishlar jurnali yozilyapti, ball
  // formulasi esa Faza 3 dan keyin. Nol ko'rsatish yolg'on emas —
  // o'quvchi hali hech narsani tugatmagan.
  const percents = level.units.map(() => 0);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-[22px] font-extrabold text-ink-900">
          {level.label}
        </h2>
        <span className="font-display text-[22px] font-extrabold text-ink-900">
          0%
        </span>
      </div>
      <LessonPath units={level.units} percents={percents} />
    </section>
  );
}

export function LernenLevelsPage() {
  const { data, isLoading, isError } = useLernenLevels();

  return (
    <Screen>
      <ScreenHeader subtitle="Nemis tili" title="Darslar" />

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
          <section className="space-y-6">
            {data.map((level) => (
              <LevelSection key={level.level} level={level} />
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
