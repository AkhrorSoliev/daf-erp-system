"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cloud, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LessonNode, type LessonNodeState } from "../lumio";
import type { LernenUnitSummary } from "./types";

/**
 * Bo'limlar yo'li — dizayn tizimidagi «Darslar» ekranidan.
 *
 * Maketda tugunlar MUTLAQ koordinatalar bilan qo'yilgan (`top: 30, 178,
 * 322`), chunki u ~390 px telefon ramkasi uchun chizilgan. Bizning ustun
 * esa desktopda 980 px gacha kengayadi, va o'sha koordinatalar bilan
 * tugunlar ikki chekkaga tarqab ketardi, bog'lovchi chiziqlar esa havoda
 * qolardi.
 *
 * Shuning uchun joylashuv OQIM bilan quriladi: har bo'lim o'z qatorida,
 * qatorlar chapga va o'ngga almashadi, bog'lovchi chiziq qatorlar
 * orasida turadi. Butun yo'l qat'iy kenglikdagi ustunga o'ralib
 * markazlashadi — zigzag kengaygan sari o'z ma'nosini yo'qotadi.
 */
const COLUMN = 380;

/** Ochilgan-yopilganini aniqlaydi: keyingisi oldingisi tugagach ochiladi. */
export function nodeState(index: number, percents: number[]): LessonNodeState {
  if (percents[index] >= 100) return "done";
  if (index === 0) return "active";
  return percents[index - 1] >= 100 ? "active" : "locked";
}

/** Ikki tugun orasidagi nuqtali chiziq. */
function Connector({ toRight }: { toRight: boolean }) {
  return (
    <div aria-hidden className="flex h-12 items-center justify-center">
      <div
        className="h-[5px] w-28 rounded-full"
        style={{
          transform: `rotate(${toRight ? 14 : -14}deg)`,
          backgroundImage:
            "repeating-linear-gradient(90deg,var(--sky-400) 0 14px,transparent 14px 26px)",
        }}
      />
    </div>
  );
}

export function LessonPath({
  units,
  percents,
}: {
  units: LernenUnitSummary[];
  percents: number[];
}) {
  const router = useRouter();

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: COLUMN }}>
      {/* Bezaklar — maketdagi bulut va uchqunlar. Faqat fon, shuning
          uchun ekran o'quvchisiga e'lon qilinmaydi. */}
      <Cloud
        aria-hidden
        size={52}
        weight="fill"
        className="pointer-events-none absolute -top-3 right-1 text-sky-400/40"
      />
      <Sparkle
        aria-hidden
        size={18}
        weight="fill"
        className="pointer-events-none absolute left-1 top-20 text-amber-400/80"
      />
      <Sparkle
        aria-hidden
        size={22}
        weight="fill"
        className="pointer-events-none absolute bottom-12 right-4 text-amber-400/80"
      />

      <div className="relative flex flex-col">
        {units.map((u, i) => {
          const left = i % 2 === 0;
          const state = nodeState(i, percents);

          return (
            <React.Fragment key={u.id}>
              {i > 0 ? <Connector toRight={!left} /> : null}

              <div
                className={cn(
                  "flex items-center gap-3",
                  left ? "flex-row" : "flex-row-reverse",
                )}
              >
                <LessonNode
                  label={`${i + 1}-bo'lim`}
                  percent={percents[i] ?? 0}
                  state={state}
                  onClick={
                    state === "locked"
                      ? undefined
                      : () => router.push(`/portal/lernen/units/${u.id}`)
                  }
                />
                <p
                  className={cn(
                    "min-w-0 flex-1 rounded-2xl bg-surface px-3.5 py-2.5 font-display text-[13px] font-bold leading-snug text-ink-900 shadow-lumio-sm",
                    left ? "text-left" : "text-right",
                  )}
                >
                  {u.titleUz}
                </p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
