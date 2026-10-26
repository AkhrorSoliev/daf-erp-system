import { TILE, between, r1, seededRandom } from "../sahna-umumiy";
import { ZONES, type ZoneId } from "./dengiz-zona";

/** How far the wall strips move per px of scroll: the scene's only parallax (dengiz.html moves its far layer at 0.35). */
export const WALL_FACTOR = 0.35;

/** Width (px) of one wall strip. The walls hug the two edges, so the moving layer is two narrow strips, not the screen. */
export const STRIP_WIDTH = 96;

/** The wall's face is set every this many px down the tile. */
export const WALL_STEP = 80;

/**
 * The scene's element budget. Spec §11 caps a scene at 1500; «Dengiz» is built
 * to a fifth of it, because stage 3 showed the cost lies in the size and the
 * number of moving full-screen layers, not in the decor (ADR-0133).
 */
export const ELEMENT_BUDGET = 300;

export interface DengizPlan {
  /** Corals, kelp or tubes on each wall strip, per tile. */
  decor: number;
  /** Swaying fronds at a zone's bottom corners (0 or 2). */
  sways: number;
  /** Bubbles rising up the screen. */
  bubbles: number;
  /** Fish schools crossing the screen. */
  schools: number;
  /** The wall strips follow the scroll. */
  parallax: boolean;
}

/**
 * What the scene draws (spec §9, ADR-0133). Full: four decorations on each
 * wall strip, two swaying fronds, eight bubbles, two fish schools, the walls
 * following the scroll. A weak device («yengil rejim») draws about half and no
 * fronds. «Kam harakat» is a still picture: no parallax, no bubbles, no fish —
 * the light shafts and the fronds stay, but the CSS holds them still.
 */
export function dengizPlan({ reduced, light }: { reduced: boolean; light: boolean }): DengizPlan {
  return {
    decor: light ? 2 : 4,
    sways: light ? 0 : 2,
    bubbles: reduced ? 0 : light ? 4 : 8,
    schools: reduced ? 0 : light ? 1 : 2,
    parallax: !reduced,
  };
}

export type DecorKind = "coral" | "fan" | "kelp" | "tube";

/** What grows on a zone's walls, in turn (dengiz.html `ZK`, cut to the big soft shapes). */
export const ZONE_DECOR: Record<ZoneId, readonly DecorKind[]> = {
  marjon: ["coral", "fan"],
  kelp: ["kelp"],
  chuqur: ["tube"],
};

/** The swaying frond at a zone's bottom corners. */
export const SWAY_DECOR: Record<ZoneId, DecorKind> = { marjon: "coral", kelp: "kelp", chuqur: "tube" };

export type Side = "left" | "right";

/** A point of a wall's face: `x` px in from the screen's edge, `y` px down the tile. */
export interface WallPoint {
  y: number;
  x: number;
}

/**
 * The rock wall of one tile (dengiz.html `wall`, cut to one tile): its face
 * every `WALL_STEP` px from y = 0 to y = TILE, 28–64 px in from the edge. The
 * last point repeats the first, so the tile's copies join without a step.
 */
export function wallPoints(seed: number): WallPoint[] {
  const rnd = seededRandom(seed);
  const xs = Array.from({ length: TILE / WALL_STEP }, () => r1(between(rnd, 28, 64)));
  return [...xs, xs[0]].map((x, i) => ({ y: i * WALL_STEP, x }));
}

/** The wall as one filled path: out from the edge, down its face in soft bulges, back up the edge. Never below y = TILE. */
export function wallPath(points: readonly WallPoint[]): string {
  let d = `M0 0L${points[0].x} 0`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    d += `Q${r1(a.x + 10)} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;
  }
  return `${d}L0 ${TILE}Z`;
}

/** A wall decoration: its foot at (`x`, `y`) in the strip's own px, grown up from there. */
export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  scale: number;
  color: string;
}

/**
 * `count` decorations on a wall's ledges (its inner points), spread down the
 * tile, in the zone's kinds and colours. Each stands on a ledge strictly inside
 * the tile and grows upward, so nothing reaches below y = TILE (the seam).
 */
export function decorSpecs(zona: ZoneId, wall: readonly WallPoint[], count: number, seed: number): Decor[] {
  const rnd = seededRandom(seed + 1);
  const ledges = wall.slice(1, -1);
  const kinds = ZONE_DECOR[zona];
  const colors = ZONES[zona].decor;
  const n = Math.min(Math.max(count, 0), ledges.length);
  return Array.from({ length: n }, (_, i): Decor => {
    const ledge = ledges[Math.floor(((i + 0.5) * ledges.length) / n)];
    return {
      kind: kinds[i % kinds.length],
      x: r1(ledge.x - 4),
      y: ledge.y,
      scale: r1(between(rnd, 0.8, 1.2)),
      color: colors[i % colors.length],
    };
  });
}

const WALL_SEED: Record<Side, number> = { left: 11, right: 23 };
const ZONE_SEED: Record<ZoneId, number> = { marjon: 0, kelp: 100, chuqur: 200 };

/** One tile of a zone's wall strip — the wall and its decor from the side's and the zone's seeds. The strip draws exactly this. */
export function stripShapes(zona: ZoneId, side: Side, count: number): { wall: WallPoint[]; decor: Decor[] } {
  const seed = WALL_SEED[side] + ZONE_SEED[zona];
  const wall = wallPoints(seed);
  return { wall, decor: decorSpecs(zona, wall, count, seed) };
}

/** A bubble: its column (percent), size (px), one rise and how far into it it starts (s), its sideways drift (px). */
export interface Bubble {
  left: number;
  size: number;
  rise: number;
  delay: number;
  dx: number;
}

export function bubbleSpecs(count: number, seed = 3): Bubble[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (): Bubble => ({
    left: r1(between(rnd, 6, 94)),
    size: Math.round(between(rnd, 4, 12)),
    rise: r1(between(rnd, 18, 30)),
    delay: r1(between(rnd, 0, 20)),
    dx: r1(between(rnd, -18, 18)),
  }));
}

/** A fish school: its height (percent), one crossing and how far into it it starts (s); every other one swims left. */
export interface School {
  top: number;
  swim: number;
  delay: number;
  chap: boolean;
}

export function schoolSpecs(count: number, seed = 5): School[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): School => ({
    top: r1(between(rnd, 18, 70)),
    swim: r1(between(rnd, 40, 60)),
    delay: r1(between(rnd, 0, 30)),
    chap: i % 2 === 1,
  }));
}

/** Where each fish of a school swims (px from the school's spot) and its size against the 30 × 16 fish. */
export const SCHOOL_FISH: readonly { x: number; y: number; s: number }[] = [
  { x: 0, y: 0, s: 1 },
  { x: 28, y: -12, s: 0.8 },
  { x: 34, y: 12, s: 0.9 },
];
