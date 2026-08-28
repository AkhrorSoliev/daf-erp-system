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

/**
 * Bezakning joylashuvi — TASODIFIY EMAS, tartib raqamidan hisoblanadi.
 *
 * `Math.random()` ishlatilsa, React qayta chizganda bulutlar sakrab
 * yurardi: bezak har renderda boshqa joyga tushadi va bu buzilgandek
 * ko'rinadi. Hash esa har doim bir xil natija beradi — ko'rinishi
 * tasodifiy, xatti-harakati barqaror.
 */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Bog'lovchi chiziq yonidagi bezak.
 *
 * Bezak faqat qatorlar ORASIDA turadi va chekkaga suriladi — tugunning
 * ustiga tushmasligi va sarlavhani to'sib qo'ymasligi uchun. Har uchinchi
 * bo'shliqda bulut, qolganida uchqun: har bo'shliqni to'ldirish yo'lni
 * shovqinga aylantiradi.
 */
function Decor({ index }: { index: number }) {
  const r = hash(index);
  const cloud = index % 3 === 0;
  const left = hash(index + 7) > 0.5;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        top: `${8 + r * 24}px`,
        ...(left ? { left: `${2 + r * 10}px` } : { right: `${2 + r * 10}px` }),
      }}
    >
      {cloud ? (
        <Cloud
          size={30 + Math.round(r * 26)}
          weight="fill"
          className="lumio-float text-sky-400/35"
          style={{
            animationDuration: `${2800 + Math.round(r * 1800)}ms`,
            animationDelay: `${Math.round(r * 900)}ms`,
          }}
        />
      ) : (
        <Sparkle
          size={13 + Math.round(r * 9)}
          weight="fill"
          className="lumio-sparkle text-amber-400"
          style={{
            animationDuration: `${1500 + Math.round(r * 900)}ms`,
            animationDelay: `${Math.round(r * 700)}ms`,
          }}
        />
      )}
    </div>
  );
}

/** Ikki tugun orasidagi nuqtali chiziq. */
function Connector({ toRight, index }: { toRight: boolean; index: number }) {
  return (
    // Butun qator bezak: chiziq ham, bulut ham ma'no tashimaydi, shuning
    // uchun ekran o'quvchisiga e'lon qilinmaydi.
    <div aria-hidden className="relative flex h-14 items-center justify-center">
      <Decor index={index} />
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
      {/* Bo'limlar ketma-ket chiqadi — yuqoridan pastga, yo'l chizilayotgandek.
          Hammasi birdan chiqsa, harakat bitta katta qadamga aylanadi va
          ko'zni yetaklamaydi. */}
      <div className="lumio-stagger relative flex flex-col">
        {units.map((u, i) => {
          const left = i % 2 === 0;
          const state = nodeState(i, percents);

          return (
            <React.Fragment key={u.id}>
              {u.firstOfLevel ? (
                <LevelMark label={u.levelLabel} />
              ) : i > 0 ? (
                <Connector toRight={!left} index={i} />
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
