"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cloud, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  LessonNode,
  type LessonNodeState,
  type LessonNodeTone,
} from "../lumio";
import type { DafLevel, LernenLevel } from "./types";

/**
 * O'quv yo'li — A1.1 dan B1 gacha BITTA uzluksiz zigzag.
 *
 * Avval har daraja o'z blokida turardi, va A1.1 ning oxirgi bo'limi bilan
 * A1.2 ning birinchisi o'rtasida bog'lanish ko'rinmasdi — go'yo ular
 * boshqa-boshqa yo'llar edi. Aslida o'quvchi ular bo'ylab ketma-ket
 * yuradi.
 *
 * Daraja o'zgarganini RANG bildiradi: har bosqich o'z tusiga ega, va
 * o'tish joyida kichik yorliq turadi. Rangsiz uzluksiz yo'l bitta uzun
 * ro'yxatga aylanib, o'quvchi qayerdaligini bilmay qolardi.
 *
 * Joylashuv oqim bilan quriladi, mutlaq koordinatalarsiz: maketdagi
 * koordinatalar ~390 px telefon ramkasi uchun edi va kengroq ekranda
 * tugunlar tarqab ketardi.
 */
const COLUMN = 380;

const LEVEL_TONE: Record<DafLevel, LessonNodeTone> = {
  A1_1: "coral",
  A1_2: "amber",
  A2_1: "teal",
  A2_2: "sky",
  B1: "grape",
};

export interface PathUnit {
  id: number;
  titleUz: string;
  level: DafLevel;
  levelLabel: string;
  /** Darajaning birinchi bo'limimi — yorliq shu yerda chiqadi. */
  firstOfLevel: boolean;
  percent: number;
}

/** Yo'lni darajalar bo'ylab bitta ro'yxatga yig'adi. */
export function flattenPath(levels: LernenLevel[]): PathUnit[] {
  return levels.flatMap((lvl) =>
    lvl.units.map((u, i) => ({
      id: u.id,
      titleUz: u.titleUz,
      level: lvl.level,
      levelLabel: lvl.label,
      firstOfLevel: i === 0,
      percent: 0,
    })),
  );
}

/** Ochilgan-yopilganini aniqlaydi: keyingisi oldingisi tugagach ochiladi. */
export function nodeState(index: number, percents: number[]): LessonNodeState {
  if (percents[index] >= 100) return "done";
  if (index === 0) return "active";
  return percents[index - 1] >= 100 ? "active" : "locked";
}

/** Ikki tugun orasidagi nuqtali chiziq. */
function Connector({ toRight }: { toRight: boolean }) {
  return (
    <div aria-hidden className="flex h-11 items-center justify-center">
      <div
        className="h-[5px] w-24 rounded-full"
        style={{
          transform: `rotate(${toRight ? 14 : -14}deg)`,
          backgroundImage:
            "repeating-linear-gradient(90deg,var(--sky-400) 0 14px,transparent 14px 26px)",
        }}
      />
    </div>
  );
}

/** Daraja o'zgargan joydagi yorliq. */
function LevelMark({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="h-px flex-1 bg-line" />
      <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function LessonPath({ units }: { units: PathUnit[] }) {
  const router = useRouter();
  const percents = units.map((u) => u.percent);

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: COLUMN }}>
      {/* Bezaklar — faqat fon, ekran o'quvchisiga e'lon qilinmaydi. */}
      {/* Bulutlar suzadi, uchqunlar miltillaydi — dizayn tizimining
          `lumio-float` va `lumio-sparkle` halqalari.
          
          Davomiylik har biriga BOSHQACHA berilgan: bir xil bo'lsa
          hammasi bir vaqtda ko'tarilib-tushib, harakat sun'iy
          ko'rinardi. Kechikish ham shu sabab. */}
      <Cloud
        aria-hidden
        size={52}
        weight="fill"
        className="lumio-float pointer-events-none absolute -top-3 right-1 text-sky-400/40"
      />
      <Cloud
        aria-hidden
        size={34}
        weight="fill"
        className="lumio-float pointer-events-none absolute left-2 top-2 text-sky-400/30"
        style={{ animationDuration: "4200ms", animationDelay: "600ms" }}
      />
      <Sparkle
        aria-hidden
        size={18}
        weight="fill"
        className="lumio-sparkle pointer-events-none absolute left-1 top-24 text-amber-400"
      />
      <Sparkle
        aria-hidden
        size={14}
        weight="fill"
        className="lumio-sparkle pointer-events-none absolute right-3 top-44 text-amber-400"
        style={{ animationDuration: "2100ms", animationDelay: "400ms" }}
      />

      <div className="relative flex flex-col">
        {units.map((u, i) => {
          const left = i % 2 === 0;
          const state = nodeState(i, percents);

          return (
            <React.Fragment key={u.id}>
              {u.firstOfLevel ? (
                <LevelMark label={u.levelLabel} />
              ) : i > 0 ? (
                <Connector toRight={!left} />
              ) : null}

              <div
                className={cn("flex", left ? "justify-start" : "justify-end")}
              >
                <LessonNode
                  label={u.titleUz}
                  percent={u.percent}
                  state={state}
                  tone={LEVEL_TONE[u.level]}
                  onClick={
                    state === "locked"
                      ? undefined
                      : () => router.push(`/portal/lernen/units/${u.id}`)
                  }
                />

                {/* Maslahat pufagi FAQAT hozirgi darsda — maketdagi kabi.
                    Avval u har tugun yonida turib, bo'lim nomini
                    takrorlardi va ekranni to'ldirib yuborardi. */}
                {state === "active" ? (
                  <p
                    className={cn(
                      "self-center rounded-2xl bg-surface px-3.5 py-2.5 font-display text-[13px] font-bold text-ink-900 shadow-lumio-sm",
                      left ? "ml-3" : "mr-3 order-first",
                    )}
                  >
                    Sizning darsingiz shu yerda
                  </p>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
