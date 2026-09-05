"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  BookOpen,
  Headphones,
  Microphone,
  PencilSimple,
  Article,
  CheckCircle,
  LockSimple,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Screen,
  ScreenHeader,
  FadeIn,
  Stagger,
  Card,
  Badge,
  ProgressBar,
  IconTile,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { useLernenLevels } from "./queries";
import { unitHolati, type UnitHolatBelgisi } from "./fortschritt";
import type { LernenUnitSummary } from "./types";

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

/** Holat belgisi — kartaning chap tomonidagi doiracha. */
function UnitBelgi({ unit, holat }: { unit: LernenUnitSummary; holat: UnitHolatBelgisi }) {
  if (holat === "BAJARILGAN") {
    return (
      <CheckCircle
        size={28}
        weight="fill"
        className="shrink-0 text-success"
      />
    );
  }
  if (holat === "QULF" || holat === "TAYYOR_EMAS") {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink-400">
        <LockSimple size={16} weight="bold" />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-coral-500/12 font-display text-sm font-extrabold text-coral-600">
      {unit.order}
    </span>
  );
}

/**
 * Bitta A1 uniti — tartib raqami, ikki nomi va ilgarilash.
 *
 * `BAJARILGAN`/`OCHIQ` bosiladi va unit sahifasiga o'tkazadi; `QULF` va
 * `TAYYOR_EMAS` bosilmaydi — ikkinchisida ilgarilash o'rniga «Tez orada»
 * turadi, chunki foizni ko'rsatishning o'zi ma'nosiz (kontent yo'q).
 */
function UnitCard({
  unit,
  holat,
}: {
  unit: LernenUnitSummary;
  holat: UnitHolatBelgisi;
}) {
  const router = useRouter();
  const bosiladimi = holat === "BAJARILGAN" || holat === "OCHIQ";
  const percent =
    unit.lessonCount > 0
      ? Math.round((unit.doneCount / unit.lessonCount) * 100)
      : 0;

  return (
    <button
      type="button"
      disabled={!bosiladimi}
      onClick={() => router.push(`/portal/lernen/units/${unit.id}`)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-lumio-sm transition-transform",
        bosiladimi
          ? "active:translate-y-[2px] hover:-translate-y-0.5"
          : "opacity-60",
      )}
    >
      <UnitBelgi unit={unit} holat={holat} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold text-ink-900">
          {unit.titleDe}
        </p>
        <p className="truncate text-sm font-semibold text-ink-500">
          {unit.titleUz}
        </p>

        {holat === "TAYYOR_EMAS" ? (
          <Badge tone="neutral" size="sm" className="mt-1.5">
            Tez orada
          </Badge>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar
              value={percent}
              height={8}
              className="flex-1"
              color={
                holat === "BAJARILGAN" ? "var(--teal-500)" : "var(--coral-500)"
              }
            />
            <span className="shrink-0 font-display text-xs font-bold text-ink-500">
              {unit.doneCount}/{unit.lessonCount}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

export function LernenLevelsPage() {
  const { data, isLoading, isError } = useLernenLevels();

  // Barcha darajalar bo'ylab yassilanadi: hozircha faqat A1 to'ldirilgan
  // (A2/B1 bo'sh `units` bilan qaytadi), shuning uchun bu allaqachon
  // «A1 unitlari ro'yxati». Daraja maydonini alohida so'rash shart emas.
  const units = React.useMemo(() => data?.flatMap((l) => l.units) ?? [], [data]);
  const holatlar = React.useMemo(() => unitHolati(units), [units]);

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
          <section className="space-y-2.5">
            <h2 className="px-1 font-display text-sm font-bold uppercase tracking-wide text-ink-500">
              A1 darslari
            </h2>
            <Stagger className="space-y-2.5">
              {units.map((u, i) => (
                <UnitCard key={u.id} unit={u} holat={holatlar[i]} />
              ))}
            </Stagger>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
              Imtihon yo&apos;nalishlari
            </h2>
            <div className="lumio-stagger grid grid-cols-2 gap-3">
              {SKILLS.map((s, i) => (
                <Card
                  key={s.key}
                  className="space-y-2 opacity-70"
                  style={{ ["--i" as string]: i } as React.CSSProperties}
                >
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
