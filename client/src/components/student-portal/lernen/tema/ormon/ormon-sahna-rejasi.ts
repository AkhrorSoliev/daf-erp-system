export type LayerId = "far" | "mid" | "near";

/** Height (px) of one tile of a layer: the layer repeats it and wraps, so the DOM never grows with the path. */
export const TILE = 640;

/** How far each layer moves per px of scroll: the farther, the slower (ormon2.html `FAC`). */
export const LAYER_FACTOR: Record<LayerId, number> = { far: 0.2, mid: 0.5, near: 0.8 };

/** The layer's blur (px), baked into its SVG once — never a CSS filter on a moving layer. */
export const LAYER_BLUR: Record<LayerId, number> = { far: 5, mid: 1.5, near: 2 };

/** The DOM/SVG budget of one scene (spec §11). */
export const ELEMENT_BUDGET = 1500;

export interface ScenePlan {
  /** Back to front; `count` = trees in one tile (far, mid) or bush clusters per edge (near). */
  layers: { id: LayerId; count: number }[];
  /** Soft glow orbs per biome. */
  glows: number;
  /** Fireflies drifting and blinking. */
  sparks: number;
  /** Leaves falling down the screen. */
  leaves: number;
  /** Mist bands drifting sideways. */
  mists: number;
  /** The layers follow the scroll. */
  parallax: boolean;
}

const LAYERS: { id: LayerId; count: number }[] = [
  { id: "far", count: 2 },
  { id: "mid", count: 8 },
  { id: "near", count: 3 },
];

/**
 * What the scene draws (spec §9). A weak device («yengil rejim») gets half:
 * no far layer, half the trees, glows, sparks, leaves and mist. «Kam harakat»
 * (system or device) is a still picture: no parallax, no sparks, no falling
 * leaves — the light shafts and the mist stay, but the CSS holds them still.
 */
export function scenePlan({ reduced, light }: { reduced: boolean; light: boolean }): ScenePlan {
  const half = (n: number) => (light ? Math.ceil(n / 2) : n);
  return {
    layers: LAYERS.filter((l) => !light || l.id !== "far").map((l) => ({ id: l.id, count: half(l.count) })),
    glows: half(3),
    sparks: reduced ? 0 : half(4),
    leaves: reduced ? 0 : half(2),
    mists: half(2),
    parallax: !reduced,
  };
}
