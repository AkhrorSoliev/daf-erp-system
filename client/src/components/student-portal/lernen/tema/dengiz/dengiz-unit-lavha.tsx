"use client";

import type * as React from "react";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../../dafi/dafi";
import type { UnitLavhaProps } from "../tema-turlari";
import { DEPTH_CHIP_ALPHA, ZONE_DEPTH_M, ZONES, zoneForUnit, type ZoneId } from "./dengiz-zona";

/** A small coral. */
function MarjonBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M12 21V11M12 15l-4-5M12 13l4-6" stroke="#ffe0ea" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Two kelp blades. */
function KelpBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M10 21C6 15 12 10 9 3M14 21C18 15 12 10 15 4" stroke="#d6ffd9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A lamp in the dark. */
function ChuqurBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="#bff8ff" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="#bff8ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ZONA_BELGISI: Record<ZoneId, () => React.JSX.Element> = {
  marjon: MarjonBelgisi,
  kelp: KelpBelgisi,
  chuqur: ChuqurBelgisi,
};

/**
 * «Dengiz»: the unit page's header in the unit's zone — its deep colour (white
 * text 6.0–10.4:1, `dengiz-kontrast.test.ts`), the zone's sign, the unit's
 * line, the zone's depth and Dafi waving hello. The depth is decoration
 * (`aria-hidden`, a number with the unit «m» through `t`); the line is read by
 * screen readers: it is the only place the unit's German title is shown.
 */
export function DengizUnitLavha({ matn, unitTartibi = 1 }: UnitLavhaProps) {
  const t = useT();
  const zona = zoneForUnit(unitTartibi);
  const Belgi = ZONA_BELGISI[zona];
  return (
    <div
      data-lavha-zona={zona}
      className="flex items-center gap-3 rounded-[26px] p-2 text-white shadow-[0_12px_30px_rgba(0,0,0,.18)]"
      style={{ background: ZONES[zona].banner }}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
        <Belgi />
      </span>
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <span
        aria-hidden
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums"
        style={{ background: `rgba(0, 0, 0, ${DEPTH_CHIP_ALPHA})` }}
      >
        {t("{n} m", { n: ZONE_DEPTH_M[zona] })}
      </span>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
