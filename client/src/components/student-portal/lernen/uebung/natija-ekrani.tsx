"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, Trophy } from "@phosphor-icons/react";
import { Button, Card, FadeIn } from "../../lumio";
import type { SeansXato } from "../seans-navbat";

export interface NatijaEkraniProps {
  togri: number;
  jami: number;
  durationMs: number;
  xatolar: SeansXato[];
  unitId: number | null;
  onQayta: () => void;
}

/** `durationMs` ni `daqiqa:soniya` ko'rinishiga o'tkazadi — masalan 65_000 → "1:05". */
function vaqtBelgisi(durationMs: number): string {
  const jamiSoniya = Math.round(durationMs / 1000);
  const daqiqa = Math.floor(jamiSoniya / 60);
  const soniya = jamiSoniya % 60;
  return `${daqiqa}:${String(soniya).padStart(2, "0")}`;
}

/**
 * Seans tugagandan keyingi natija ekrani: ball, sarflangan vaqt va
 * xato qilingan so'zlar. To'g'ri javob har bir xato uchun `xatolar`
 * ichida allaqachon bor — bu ekran hech narsani qayta hisoblamaydi,
 * faqat `seans-navbat.ts` yig'gan holatni ko'rsatadi.
 */
export function NatijaEkrani({
  togri,
  jami,
  durationMs,
  xatolar,
  unitId,
  onQayta,
}: NatijaEkraniProps) {
  const router = useRouter();
  const davomHref = unitId ? `/portal/lernen/units/${unitId}` : "/portal/lernen";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-8">
      <FadeIn className="space-y-4">
        <Card className="space-y-3 text-center">
          <Trophy size={48} weight="fill" className="mx-auto text-amber-500" />
          <div>
            <p className="font-display text-4xl font-bold text-ink-900">
              {togri} / {jami}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 font-semibold text-ink-500">
              <Clock size={16} weight="bold" />
              {vaqtBelgisi(durationMs)}
            </p>
          </div>
        </Card>

        <Card className="space-y-3">
          {xatolar.length === 0 ? (
            <p className="text-center font-semibold text-ink-700">
              Hammasi to&apos;g&apos;ri — ajoyib natija!
            </p>
          ) : (
            <>
              <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                Qaytarib ko&apos;ring · {xatolar.length}
              </p>
              <ul className="space-y-2">
                {xatolar.map((x, i) => (
                  <li
                    key={`${x.itemType}:${x.itemId}:${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-tint px-3.5 py-2.5"
                  >
                    <span className="font-semibold text-ink-800">{x.prompt}</span>
                    <span className="text-sm font-bold text-danger">{x.richtig}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onQayta}>
            Qayta o&apos;tish
          </Button>
          <Button className="flex-1" onClick={() => router.push(davomHref)}>
            Davom etish
          </Button>
        </div>
      </FadeIn>
    </div>
  );
}
