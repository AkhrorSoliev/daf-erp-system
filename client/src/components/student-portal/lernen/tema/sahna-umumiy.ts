import type { DafLessonKind } from "../types";

// Pure helpers every scene theme shares (ADR-0132, ADR-0133). They came out of
// «O'rmon» unchanged; «Dengiz» and any later scene take them from here.

/** Height (px) of one tile of a scene layer: the layer repeats it and wraps, so the DOM never grows with the path. */
export const TILE = 640;

/**
 * How many times a layer draws its tile (the tile itself plus
 * `TILE_COPIES - 1` `<use>` copies). The layer is the screen plus one tile tall
 * and its scroll offset wraps in (-TILE, 0], so the copies must reach
 * viewport + TILE: they cover viewports up to (TILE_COPIES - 1) * TILE = 1920 px.
 */
export const TILE_COPIES = 4;

/** A place card over a scene is `bg-surface/90` (`SahnaJoy`); the contrast tests read this share. */
export const CARD_SURFACE_ALPHA = 0.9;

/**
 * Spec §5 `palitraUnitga`: the stage (0-based, of `length`) of a unit by its
 * order in its level — 1 → 0, 2 → 1, … — starting over after `length`. An
 * order the data should never hold still gets one exact stage: the walk
 * continues backwards below 1, a fraction is cut, and a number that is not a
 * number is the first unit.
 */
export function unitCycleIndex(unitOrder: number, length: number): number {
  const n = Number.isFinite(unitOrder) ? Math.trunc(unitOrder) : 1;
  return (((n - 1) % length) + length) % length;
}

/**
 * Seeded random numbers (mulberry32, the mockups' `RNG`): the server and the
 * browser draw the same scene, so hydration matches and nothing jumps.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between `a` and `b` from a seeded stream. */
export const between = (rnd: () => number, a: number, b: number) => a + rnd() * (b - a);

/** Rounded to one decimal: short, stable markup. */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A lesson's place in a scene by its step (spec §8, ADR-0132). `joylar` names
 * a place for EVERY step, so a new `DafLessonKind` stops compiling until each
 * theme gives it one. An old DiB lesson (`null`) and a kind this build does
 * not know (the server and the client are deployed by hand, so they can
 * differ) are the first meeting's place: the page still draws. Only the map's
 * own keys count, so a value such as "constructor" falls back too.
 */
export function joyTanla<J extends string>(kind: DafLessonKind | null, joylar: Record<DafLessonKind, J>): J {
  return kind != null && Object.prototype.hasOwnProperty.call(joylar, kind) ? joylar[kind] : joylar.SECTION_A;
}
