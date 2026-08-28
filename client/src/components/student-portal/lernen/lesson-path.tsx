"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cloud, Sparkle } from "@phosphor-icons/react";
import { LessonNode, type LessonNodeState } from "../lumio";
import type { LernenUnitSummary } from "./types";

/**
 * Bo'limlar yo'li — Duolingo uslubidagi zigzag.
 *
 * Dizayn tizimidagi «Darslar» ekranidan olingan
 * (`daf-design-system/ui_kits/student-app/screens.jsx`): tugunlar chapga
 * va o'ngga almashib boradi, orasida nuqtali chiziq, fonda bulut va
 * uchqunlar.
 *
 * Tugun BALANDLIGI bilan emas, tartib bilan joylashadi: mutlaq
 * koordinatalar maketda qat'iy yozilgan edi (top: 30, 178, 322), lekin
 * bo'lim soni darajaga qarab o'zgaradi — 1 dan 4 tagacha. Shuning uchun
 * qadam hisoblanadi.
 */
const STEP = 148;
const NODE = 132;

/** Ochilgan-yopilganini aniqlaydi: keyingisi oldingisi tugagach ochiladi. */
export function nodeState(index: number, percents: number[]): LessonNodeState {
  if (percents[index] >= 100) return "done";
  if (index === 0) return "active";
  return percents[index - 1] >= 100 ? "active" : "locked";
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
    <div
      className="relative mx-1.5"
      style={{ height: units.length * STEP + 40 }}
    >
      {/* Fon bezaklari — maketdagi bulut va uchqunlar. */}
      <Cloud
        size={56}
        weight="fill"
        className="absolute right-10 top-1.5 text-sky-400/45"
      />
      <Cloud
        size={38}
        weight="fill"
        className="absolute right-24 top-8 text-sky-400/45"
      />
      <Sparkle
        size={22}
        weight="fill"
        className="absolute left-28 top-32 text-amber-400"
      />
      <Sparkle
        size={16}
        weight="fill"
        className="absolute left-10 top-16 text-amber-400"
      />

      {units.map((u, i) => {
        const left = i % 2 === 0;
        const state = nodeState(i, percents);

        return (
          <React.Fragment key={u.id}>
            {i > 0 ? (
              <div
                aria-hidden
                className="absolute h-[5px] rounded-full"
                style={{
                  top: i * STEP - 18,
                  left: left ? 70 : undefined,
                  right: left ? undefined : 70,
                  width: 110,
                  transform: `rotate(${left ? -6 : 6}deg)`,
                  backgroundImage:
                    "repeating-linear-gradient(90deg,var(--sky-400) 0 14px,transparent 14px 26px)",
                }}
              />
            ) : null}

            <LessonNode
              label={`${i + 1}-bo'lim`}
              percent={percents[i] ?? 0}
              state={state}
              onClick={
                state === "locked"
                  ? undefined
                  : () => router.push(`/portal/lernen/units/${u.id}`)
              }
              className="absolute"
              style={{
                top: i * STEP + 10,
                ...(left ? { left: 16 } : { right: 16 }),
              }}
            />

            <div
              className="absolute max-w-[150px] font-display text-[13px] font-bold text-ink-900"
              style={{
                top: i * STEP + 44,
                ...(left
                  ? { left: 16 + NODE + 14 }
                  : { right: 16 + NODE + 14 }),
              }}
            >
              <p className="rounded-2xl bg-surface px-3.5 py-2.5 shadow-lumio-sm">
                {u.titleUz}
              </p>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
