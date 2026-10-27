import type * as React from "react";
import type { DafLessonKind } from "../../types";
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { type BelgiProps, type JoyKorinishi, SahnaJoy } from "../sahna-qismlari";
import { joyTanla } from "../sahna-umumiy";
import { ACCENT } from "./dengiz-zona";

export type DengizJoyId = "chiganoq" | "kema" | "gor" | "xazina";

/** Every lesson step's place under the sea: a new kind stops compiling here until it has one. */
const JOYLAR: Record<DafLessonKind, DengizJoyId> = {
  SECTION_A: "chiganoq",
  SECTION_B: "kema",
  BRIDGE: "gor",
  UNIT_TEST: "xazina",
};

/**
 * Which place a lesson is under the sea (spec §8): the first meeting in a
 * shell house, the practice on a sunken ship, the passage test in a cave, the
 * final test at the treasure. An old DiB lesson has no step, and a kind this
 * build does not know (the server and the client are deployed by hand) is
 * drawn too: the shell house.
 */
export function placeForKind(kind: DafLessonKind | null): DengizJoyId {
  return joyTanla(kind, JOYLAR);
}

/** A shell house with a door and a pearl (dengiz.html `shellArt`). */
function Chiganoq({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="56" rx="24" ry="5" fill="#c75a7e" opacity="0.4" />
      <path d="M8 52A24 24 0 0 1 56 52Z" fill="#ff9bb3" />
      <path d="M32 52L14 34M32 52V28M32 52L50 34" stroke="#ffc2d1" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 52V44a6 6 0 0 1 12 0V52Z" fill="#7a5aa8" />
      <circle cx="32" cy="22" r="4" fill="#ffe58a" />
    </svg>
  );
}

/** A sunken ship, listing, with a lit porthole (dengiz.html `wreckArt`). */
function Kema({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="57" rx="28" ry="4" fill="#3b6f8f" opacity="0.4" />
      <g transform="rotate(-9 32 40)">
        <path d="M32 10V40" stroke="#5a3a1e" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 13L52 36H34Z" fill="#e4dcc8" />
        <path d="M6 40H58Q55 54 40 56H22Q9 54 6 40Z" fill="#a8683a" />
        <circle cx="22" cy="47" r="3" fill="#7ffcff" />
      </g>
    </svg>
  );
}

/** A cave in a rock, with two eyes in the dark (dengiz.html `caveArt`). */
function Gor({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M2 58Q4 18 32 10Q60 18 62 58Z" fill="#7d86c4" />
      <ellipse cx="32" cy="48" rx="15" ry="14" fill="#243a86" />
      <circle cx="27" cy="46" r="2" fill="#9ffff7" />
      <circle cx="37" cy="46" r="2" fill="#9ffff7" />
      <path d="M6 58Q4 50 8 46M58 58Q62 50 56 44" stroke="#6bf5c9" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A treasure chest on the sand (dengiz.html `vaultArt` / `chestSVG`). */
function Xazina({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="57" rx="26" ry="4" fill="#d9b26a" opacity="0.5" />
      <rect x="10" y="30" width="44" height="24" rx="4" fill="#a8683a" />
      <path d="M10 30V24Q10 12 32 12Q54 12 54 24V30Z" fill="#b9753a" />
      <rect x="10" y="28" width="44" height="4" fill="#e9c46a" />
      <rect x="28" y="30" width="8" height="10" rx="2" fill="#e9c46a" />
      <circle cx="32" cy="22" r="3" fill="#7ffcff" />
    </svg>
  );
}

/** The emblem of each place: hand-drawn, still SVG (the mockup's emoji are not used, spec §14). */
export const JOY_BELGISI: Record<DengizJoyId, (p: BelgiProps) => React.JSX.Element> = {
  chiganoq: Chiganoq,
  kema: Kema,
  gor: Gor,
  xazina: Xazina,
};

/** The light behind the emblem, per state (dengiz.html `.spot.done`, `.spot.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(243, 226, 255, 0.85), rgba(243, 226, 255, 0))",
  active: "radial-gradient(closest-side, rgba(255, 228, 138, 0.85), rgba(255, 228, 138, 0))",
  locked: "radial-gradient(closest-side, rgba(120, 150, 210, 0.35), rgba(120, 150, 210, 0))",
};

/** The corner badge, per state (dengiz.html `.badge`); `dengiz-kontrast.test.ts` holds each pair to 3:1. */
export const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#e3c6ff", rang: "#4a2a7a" },
  active: { fon: "#ffe48a", rang: "#6b4500" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Murk over a locked place's emblem (dengiz.html `.fog`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(14, 34, 80, 0.7), rgba(14, 34, 80, 0.25) 70%, rgba(14, 34, 80, 0))";

const DENGIZ_JOY: JoyKorinishi = {
  nur: NUR,
  nishon: NISHON,
  tuman: TUMAN,
  accent: ACCENT,
  faolNur: "0 0 40px rgba(255, 228, 138, 0.45)",
};

/**
 * «Dengiz»: one lesson as a place under the sea (spec §8) — a shell house, a
 * ship, a cave or the treasure by the lesson's step, drawn by the shared place
 * card (`SahnaJoy`); a locked one waits in the murk.
 */
export function DengizJoy(p: UnitJoyiProps) {
  const joy = placeForKind(p.kind);
  return <SahnaJoy {...p} tema="dengiz" joy={joy} Belgi={JOY_BELGISI[joy]} korinish={DENGIZ_JOY} />;
}
