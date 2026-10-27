import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { type JoyKorinishi, SahnaJoy } from "../sahna-qismlari";
import { ACCENT } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";

/** The light behind the emblem, per state (ormon2.html `.pl::before`, `.pl.done`, `.pl.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(255, 233, 162, 0.8), rgba(255, 233, 162, 0))",
  active: "radial-gradient(closest-side, rgba(166, 253, 232, 0.85), rgba(166, 253, 232, 0))",
  locked: "radial-gradient(closest-side, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0))",
};

/** The corner badge, per state (ormon2.html `.pl .bd`); `ormon-kontrast.test.ts` holds each pair to 3:1. */
export const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#f2cd7a", rang: "#5a3d10" },
  active: { fon: "#86ead2", rang: "#0d4a3d" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Fog over a locked place's emblem (ormon2.html `.pl.lock::after`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0))";

const ORMON_JOY: JoyKorinishi = {
  nur: NUR,
  nishon: NISHON,
  tuman: TUMAN,
  accent: ACCENT,
  faolNur: "0 0 40px rgba(166, 253, 232, 0.4)",
};

/**
 * «O'rmon»: one lesson as a place in the forest (spec §8) — a hut, a bridge, a
 * cave or a castle by the lesson's step, drawn by the shared place card
 * (`SahnaJoy`); a locked one is covered in fog.
 */
export function OrmonJoy(p: UnitJoyiProps) {
  const joy = placeForKind(p.kind);
  return <SahnaJoy {...p} tema="ormon" joy={joy} Belgi={JOY_BELGISI[joy]} korinish={ORMON_JOY} />;
}
