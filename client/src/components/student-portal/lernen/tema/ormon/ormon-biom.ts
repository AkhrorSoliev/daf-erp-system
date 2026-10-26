import { unitCycleIndex } from "../sahna-umumiy";

/** The «O'rmon» theme's three biomes (spec §8): dawn, lake, autumn. */
export const BIOME_IDS = ["tong", "kol", "kuz"] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export interface BiomePalette {
  /** The sky gradient, top and bottom. */
  sky1: string;
  sky2: string;
  /** Far hills and trees, the middle trees, the near bushes at the edges. */
  far: string;
  mid: string;
  near: string;
  /** Light: the glow orbs, the sparks, the light shafts. */
  glow: string;
}

/** The CEO-approved mockup's colours (ormon2.html `PAL`). */
export const BIOMES: Record<BiomeId, BiomePalette> = {
  tong: { sky1: "#1f4d47", sky2: "#e8d9a6", far: "#a4c9b4", mid: "#3f8a72", near: "#1d5a4c", glow: "#fff1c4" },
  kol: { sky1: "#25506a", sky2: "#a4d2d8", far: "#aed5d8", mid: "#3f8c9c", near: "#235e70", glow: "#e4fbff" },
  kuz: { sky1: "#58383a", sky2: "#f0bd90", far: "#e4b498", mid: "#b8684f", near: "#7a403c", glow: "#ffe4bc" },
};

/** Dark mode: one still veil over the whole scene instead of a second set of colours. */
export const DARK_VEIL = { color: "#04120e", alpha: 0.45 } as const;

// The place cards' surface over the scene is `bg-surface/90` (the contrast test reads this): the shared card's.
export { CARD_SURFACE_ALPHA } from "../sahna-umumiy";

/** The theme's own deep green: the «Boshlash» pill and the current place's ring (white text 6.1:1). */
export const ACCENT = "#0d6f5b";

/**
 * Spec §5 `palitraUnitga`: a unit's biome by its order in its level
 * (1 → tong, 2 → ko'l, 3 → kuz, 4 → tong …). The path and the unit page both
 * know the order, so the two screens agree without another request.
 */
export function biomeForUnit(unitOrder: number): BiomeId {
  return BIOME_IDS[unitCycleIndex(unitOrder, BIOME_IDS.length)];
}
