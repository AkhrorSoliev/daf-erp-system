import { between, r1, seededRandom } from "../sahna-umumiy";
import { TILE, type LayerId } from "./ormon-sahna-rejasi";

// The seeded numbers are shared by every scene; re-exported for the forest's own users and tests.
export { seededRandom };

/** A far hill: `cx` in percent of the scene's width, the rest in px. */
export interface Hill {
  kind: "hill";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A soft tree (a trunk and four round crowns) standing at `x` percent, `y` px. */
export interface Tree {
  kind: "tree";
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

/** A round bush hugging one edge, `inset` px in from it (negative: partly off screen). */
export interface Bush {
  kind: "bush";
  side: "left" | "right";
  inset: number;
  cy: number;
  r: number;
}

export type Shape = Hill | Tree | Bush;

/**
 * One tile of a layer (ormon2.html `farLayer` / `midLayer` / `nearLayer`, cut
 * to one tile): far — a hill every 150 px and `count` big pale trees; mid —
 * `count` trees, the lower ones drawn last; near — `count` clusters of three
 * bushes on each edge, so the middle, where the path is, stays calm.
 */
export function layerShapes(layer: LayerId, count: number, seed: number): Shape[] {
  const rnd = seededRandom(seed);
  if (layer === "far") {
    const hills: Hill[] = [];
    for (let y = 70; y < TILE; y += 150) {
      hills.push({
        kind: "hill",
        cx: r1(between(rnd, 8, 92)),
        cy: y,
        rx: r1(between(rnd, 170, 260)),
        ry: r1(between(rnd, 50, 80)),
      });
    }
    const trees = Array.from({ length: count }, (_, i): Tree => ({
      kind: "tree",
      x: r1(between(rnd, 5, 95)),
      y: r1(110 + (i * TILE) / count),
      scale: r1(between(rnd, 2.4, 3.4)),
      opacity: 0.4,
    }));
    return [...hills, ...trees];
  }
  if (layer === "mid") {
    const trees = Array.from({ length: count }, (): Tree => ({
      kind: "tree",
      x: r1(between(rnd, -3, 103)),
      y: r1(between(rnd, 120, TILE)),
      scale: r1(between(rnd, 1.7, 2.5)),
      opacity: r1(between(rnd, 0.55, 0.8)),
    }));
    return trees.sort((a, b) => a.y - b.y);
  }
  const bushes: Bush[] = [];
  for (const side of ["left", "right"] as const) {
    for (let i = 0; i < count; i++) {
      const y = (i + 0.5) * (TILE / count);
      for (let k = 0; k < 3; k++) {
        bushes.push({
          kind: "bush",
          side,
          inset: r1(between(rnd, -32, 8)),
          cy: r1(y + between(rnd, -50, 50)),
          r: r1(between(rnd, 40, 72)),
        });
      }
    }
  }
  return bushes;
}

/** A firefly: where it rests (percent of the scene), how far it drifts (px), its drift and blink periods (s). */
export interface Spark {
  left: number;
  top: number;
  dx: number;
  dy: number;
  drift: number;
  blink: number;
}

export function sparkSpecs(count: number, seed = 7): Spark[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (): Spark => ({
    left: r1(between(rnd, 8, 92)),
    top: r1(between(rnd, 15, 85)),
    dx: r1(between(rnd, -26, 26)),
    dy: r1(between(rnd, -26, 26)),
    drift: r1(between(rnd, 8, 13)),
    blink: r1(between(rnd, 3, 5)),
  }));
}

/** A falling leaf: its column (percent), the length of one fall and how far into it the leaf starts (s). */
export interface Leaf {
  left: number;
  fall: number;
  delay: number;
}

export function leafSpecs(count: number, seed = 13): Leaf[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): Leaf => ({
    left: r1(between(rnd, 10, 85)),
    fall: 20 + i * 6,
    delay: i * 11,
  }));
}

/** A soft glow orb behind the trees: its corner (percent), size (px) and strength. */
export interface Glow {
  left: number;
  top: number;
  size: number;
  opacity: number;
}

export function glowSpecs(count: number, seed = 29): Glow[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): Glow => ({
    left: r1(between(rnd, -20, 60)),
    top: r1((100 / count) * i + between(rnd, 0, 12)),
    size: Math.round(between(rnd, 200, 280)),
    opacity: r1(between(rnd, 0.3, 0.5)),
  }));
}

/** A mist band: its height on the screen (percent) and how far into its drift it starts (s). */
export interface Mist {
  top: number;
  delay: number;
}

export function mistSpecs(count: number): Mist[] {
  return Array.from({ length: count }, (_, i): Mist => ({ top: 18 + i * 42, delay: i * 9 }));
}
