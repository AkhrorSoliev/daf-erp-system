"use client";

import * as React from "react";
import { CheckCircle, Fire, Star } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../dafi/dafi";
import { ovozChal } from "../ovoz/ovoz";
import { aniqlikFoizi, type NatijaHissiyoti } from "./hissiyot";
import { useSanaladiganBall } from "./sanoq";

/** `durationMs` as minutes:seconds — 65_000 → "1:05". */
function vaqtBelgisi(durationMs: number): string {
  const jamiSoniya = Math.round(durationMs / 1000);
  const daqiqa = Math.floor(jamiSoniya / 60);
  const soniya = jamiSoniya % 60;
  return `${daqiqa}:${String(soniya).padStart(2, "0")}`;
}

/** One of the three result cards (duo.html `.card`): a filled caption over the value. */
function Karta({ nom, qiymat, belgi }: { nom: string; qiymat: string; belgi: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-coral-700 bg-surface">
      {/* coral-700, not coral-500: white 11px text needs 4.5:1 (5.07:1 here, 2.82:1 on coral-500). */}
      <p className="bg-coral-700 px-1 py-1 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white">
        {nom}
      </p>
      <p className="flex items-center justify-center gap-1 px-1.5 py-2.5 font-display text-xl font-extrabold tabular-nums text-ink-900">
        {belgi}
        {qiymat}
      </p>
    </div>
  );
}

export interface NatijaSahnaProps {
  togri: number;
  jami: number;
  durationMs: number;
  /** The server's points; `null` until it answers (or when it never does). */
  ball: number | null;
  /** The server's streak in days; `null` until it answers. */
  serie: number | null;
  hissiyot: NatijaHissiyoti;
  /** A review session: the heading says «Takrorlash tugadi!». */
  takrorlash?: boolean;
}

/**
 * The top of the result screen (spec §9, duo.html `.res`): Dafi, the heading
 * and the points, accuracy and streak cards. When the result deserves it
 * (`hissiyot.bayram`) the reward sound plays ONCE — the ref outlives React
 * StrictMode's second effect run — and Dafi's three hops are his «bayram»
 * state. The confetti is NOT here: the screen throws it beside the fading
 * content, because a `fixed` canvas inside the fade-up box is sized to that
 * box while its transform runs. Theme-independent: the theme only draws the
 * background around it (`LernenTema.MukofotFoni`).
 */
export function NatijaSahna({
  togri,
  jami,
  durationMs,
  ball,
  serie,
  hissiyot,
  takrorlash = false,
}: NatijaSahnaProps) {
  const t = useT();
  const sanaladigan = useSanaladiganBall(ball);
  const chalindi = React.useRef(false);

  React.useEffect(() => {
    if (!hissiyot.bayram || chalindi.current) return;
    chalindi.current = true;
    ovozChal("mukofot");
  }, [hissiyot.bayram]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Dafi holat={hissiyot.dafi} olcham="lg" />
      <div>
        <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink-900">
          {takrorlash ? t("Takrorlash tugadi!") : t("Dars tugadi!")}
        </h1>
        {/* ink-600, not ink-500: the line sits on the theme's tint and needs 4.5:1. */}
        <p className="mt-1 font-semibold tabular-nums text-ink-600">
          {togri} / {jami} · {vaqtBelgisi(durationMs)}
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-2.5">
        <Karta
          nom={t("Ball")}
          qiymat={ball == null ? "—" : `+${sanaladigan ?? 0}`}
          belgi={<Star size={18} weight="fill" className="text-amber-500" />}
        />
        <Karta
          nom={t("Aniqlik")}
          qiymat={`${aniqlikFoizi(togri, jami)}%`}
          belgi={<CheckCircle size={18} weight="fill" className="text-teal-500" />}
        />
        <Karta
          nom={t("Seriya")}
          qiymat={serie == null ? "—" : String(serie)}
          belgi={<Fire size={18} weight="fill" className="text-coral-500" />}
        />
      </div>
    </div>
  );
}
