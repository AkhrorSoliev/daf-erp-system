import type { LernenTema, MukofotFoniProps } from "../tema-turlari";
import { SahnaMukofotFoni } from "../sahna-qismlari";
import { DengizJoy } from "./dengiz-joy";
import { DengizSahna } from "./dengiz-sahna";
import { DengizTugun } from "./dengiz-tugun";
import { DengizUnitLavha } from "./dengiz-unit-lavha";
import { ZONES } from "./dengiz-zona";

/**
 * «Dengiz»: the reward stands in clear shallow water over the sand
 * (dengiz.html `.reward`, pale so the result's text keeps 4.5:1) — the shared
 * reward background in the `--dengiz-*` tokens, with slow light rays for a
 * celebration. The mockup's chest is not drawn: Dafi and the confetti are the
 * celebration, and they are not the theme's.
 */
export function DengizMukofotFoni(p: MukofotFoniProps) {
  return <SahnaMukofotFoni {...p} tema="dengiz" />;
}

/**
 * «Dengiz»'s picture on its card in the look dialog (spec §7): a still dive
 * from the reef to the deep, two walls, two bubbles and a lit node. Its own
 * static SVG with its own gradient id: only ONE scene may stand in a document
 * (ADR-0132), so it never reuses the scene's parts.
 */
export function DengizMiniatyura() {
  return (
    <svg data-miniatyura="dengiz" viewBox="0 0 56 40" className="h-10 w-14" aria-hidden="true">
      <defs>
        <linearGradient id="dengiz-miniatyura-suv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ZONES.marjon.top} />
          <stop offset="1" stopColor={ZONES.chuqur.bottom} />
        </linearGradient>
      </defs>
      <rect width="56" height="40" rx="10" fill="url(#dengiz-miniatyura-suv)" />
      <path d="M0 6Q8 14 4 24T6 40H0Z" fill={ZONES.marjon.rock} />
      <path d="M56 10Q48 18 52 28T50 40H56Z" fill={ZONES.kelp.rock} />
      <circle cx="16" cy="11" r="2" fill="#ffffff" opacity="0.7" />
      <circle cx="40" cy="18" r="1.5" fill="#ffffff" opacity="0.7" />
      <circle cx="28" cy="26" r="9" fill="#ffe7a0" opacity="0.4" />
      <circle cx="28" cy="26" r="6" fill="#ffbe55" />
    </svg>
  );
}

/** «Dengiz» (spec §8, ADR-0133): a dive in three zones, built cheaper than «O'rmon». */
export const dengizTema: LernenTema = {
  id: "dengiz",
  TugunBelgisi: DengizTugun,
  MukofotFoni: DengizMukofotFoni,
  UnitLavha: DengizUnitLavha,
  UnitJoyi: DengizJoy,
  Sahna: DengizSahna,
  Miniatyura: DengizMiniatyura,
};
