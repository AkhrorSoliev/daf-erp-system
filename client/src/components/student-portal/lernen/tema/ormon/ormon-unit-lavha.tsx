"use client";

import type * as React from "react";
import { Dafi } from "../../dafi/dafi";
import type { UnitLavhaProps } from "../tema-turlari";
import { BIOMES, biomeForUnit, type BiomeId } from "./ormon-biom";

/** The dawn sun. */
function TongBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="15" r="5" fill="#fff1c4" />
      <path d="M3 20h18M12 4v3M5 9l2 2M19 9l-2 2" stroke="#fff1c4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The lake's waves. */
function KolBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path
        d="M3 10q3-3 6 0t6 0 6 0M3 16q3-3 6 0t6 0 6 0"
        fill="none"
        stroke="#e4fbff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** An autumn leaf. */
function KuzBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M12 3C6 7 5 14 12 21c7-7 6-14 0-18z" fill="#ffe4bc" />
      <path d="M12 7v14" stroke="#7a403c" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const BIOM_BELGISI: Record<BiomeId, () => React.JSX.Element> = {
  tong: TongBelgisi,
  kol: KolBelgisi,
  kuz: KuzBelgisi,
};

/**
 * «O'rmon»: the unit page's header in the unit's biome — its deep green (white
 * text 7.2–8.0:1, `ormon-kontrast.test.ts`), the biome's sign, the unit's line
 * and Dafi waving hello. Read by screen readers: it is the only place the
 * unit's German title is shown.
 */
export function OrmonUnitLavha({ matn, unitTartibi = 1 }: UnitLavhaProps) {
  const biome = biomeForUnit(unitTartibi);
  const Belgi = BIOM_BELGISI[biome];
  return (
    <div
      data-lavha-biom={biome}
      className="flex items-center gap-3 rounded-[26px] p-2 text-white shadow-[0_12px_30px_rgba(0,0,0,.18)]"
      style={{ background: BIOMES[biome].near }}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
        <Belgi />
      </span>
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
