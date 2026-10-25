"use client";

import * as React from "react";
import { CheckCircle, Fire, Star } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../dafi/dafi";
import { aniqlikFoizi, type NatijaHissiyoti, type NatijaSarlavhasi } from "./hissiyot";
import { useSanaladiganBall } from "./sanoq";

/** `durationMs` as minutes:seconds — 65_000 → "1:05". */
function vaqtBelgisi(durationMs: number): string {
  const jamiSoniya = Math.round(durationMs / 1000);
  const daqiqa = Math.floor(jamiSoniya / 60);
  const soniya = jamiSoniya % 60;
  return `${daqiqa}:${String(soniya).padStart(2, "0")}`;
}

/**
 * The points card's value: a dash until the server answers, a plain «0» when it
 * says no points (never «+0»), and «+n» for points earned, counting up from «+0».
 */
export function ballMatni(ball: number | null, sanaladigan: number | null): string {
  if (ball == null) return "—";
  if (ball === 0) return "0";
  return `+${sanaladigan ?? 0}`;
}

/**
 * One of the three result cards (duo.html `.card`): a filled caption over the value.
 * The card spans two rows of the cards' grid and takes them over (subgrid), so the three
 * caption bars are equally tall and the three values line up even when one caption wraps.
 */
function Karta({ nom, qiymat, belgi }: { nom: string; qiymat: string; belgi: React.ReactNode }) {
  return (
    // The card clips to its corner. `rounded-md` (16 px under .lumio) below `sm`: at 36 px the arc
    // hid the bar's first and last letters (x < 14 px at the cap tops); 16 px hides x < 1.1 px.
    // `grid-cols-1` (= minmax(0, 1fr)): an auto column would grow to the widest value row and the card
    // would clip it (the «%» of «100%» and the icon were gone at 320 px).
    <div className="row-span-2 grid grid-cols-1 grid-rows-subgrid overflow-hidden rounded-md border-2 border-coral-700 bg-surface sm:rounded-2xl">
      {/* coral-700, not coral-500: white small text needs 4.5:1 (5.07:1 here, 2.82:1 on coral-500).
          Below `sm` the card is only 77 px wide at 360 (64 at 320), so the caption is 10 px with
          normal tracking and 2 px padding: German «GENAUIGKEIT» is 68 px then. At 320 it still
          does not fit one line, so it wraps (hyphenated, else broken) instead of clipping. The
          bar can be taller than one line (the row follows the tallest caption), so the text is
          centred in it; `py-1.5` also lowers the cap tops clear of the rounded corner. */}
      <p className="bg-coral-700 flex items-center justify-center px-0.5 py-1.5 text-[10px] font-extrabold uppercase leading-tight tracking-normal text-white break-words hyphens-auto sm:text-[11px] sm:tracking-wide">
        <span className="min-w-0">{nom}</span>
      </p>
      {/* The card is 64 px wide inside at 320 (77 at 360). «100%» is 51.5 px at 20 px, 85.5 px with the
          icon, gap and padding: too wide. Below `sm` the value is 18 px (46.35), the gap 2 px and the
          padding 2 px a side: 74.35 px, which fits at 360 and 390. At 320 it still cannot, so the icon
          wraps above the value (`flex-wrap`, the lines kept together by `content-center`) rather than
          being clipped; the shared row then takes the tallest value's height. */}
      <p className="flex min-w-0 flex-wrap content-center items-center justify-center gap-0.5 px-0.5 py-2.5 font-display text-lg font-extrabold tabular-nums text-ink-900 sm:gap-1 sm:px-1.5 sm:text-xl">
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
  /** Which heading to wear (`natijaSarlavhasi`): «Dars tugadi!», «Takrorlash tugadi!» or a neutral «Natija». */
  sarlavha?: NatijaSarlavhasi;
}

/**
 * The top of the result screen (spec §9, duo.html `.res`): Dafi, the heading
 * and the points, accuracy and streak cards. Dafi's three hops are his «bayram»
 * state when the result deserves it (`hissiyot.bayram`). Neither the confetti
 * nor the reward sound is here: the screen throws the confetti beside the
 * fading content (a `fixed` canvas inside the fade-up box is sized to that box
 * while its transform runs) and plays the sound once from its own effect, so a
 * theme swapping `MukofotFoni` — this scene remounts then — cannot repeat it.
 * Theme-independent: the theme only draws the background around it
 * (`LernenTema.MukofotFoni`).
 */
export function NatijaSahna({
  togri,
  jami,
  durationMs,
  ball,
  serie,
  hissiyot,
  sarlavha = "dars",
}: NatijaSahnaProps) {
  const t = useT();
  const sanaladigan = useSanaladiganBall(ball);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Dafi holat={hissiyot.dafi} olcham="lg" />
      <div>
        <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink-900">
          {sarlavha === "takrorlash"
            ? t("Takrorlash tugadi!")
            : sarlavha === "neytral"
              ? t("Natija")
              : t("Dars tugadi!")}
        </h1>
        {/* ink-600, not ink-500: the line sits on the theme's tint and needs 4.5:1. */}
        <p className="mt-1 font-semibold tabular-nums text-ink-600">
          {togri} / {jami} · {vaqtBelgisi(durationMs)}
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-x-2.5">
        <Karta
          nom={t("Ball")}
          qiymat={ballMatni(ball, sanaladigan)}
          belgi={<Star size={18} weight="fill" className="shrink-0 text-amber-500" />}
        />
        <Karta
          nom={t("Aniqlik")}
          qiymat={`${aniqlikFoizi(togri, jami)}%`}
          belgi={<CheckCircle size={18} weight="fill" className="shrink-0 text-teal-500" />}
        />
        <Karta
          nom={t("Seriya")}
          qiymat={serie == null ? "—" : String(serie)}
          belgi={<Fire size={18} weight="fill" className="shrink-0 text-coral-500" />}
        />
      </div>
    </div>
  );
}
