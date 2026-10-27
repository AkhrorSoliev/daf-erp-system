import { unitCycleIndex } from "../sahna-umumiy";

/** The «Dengiz» theme's three zones, top to bottom of a dive (spec §8): the coral reef, the kelp forest, the deep sea. */
export const ZONE_IDS = ["marjon", "kelp", "chuqur"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export interface ZonePalette {
  /** The water: the top, the middle and the bottom of the screen. */
  top: string;
  mid: string;
  bottom: string;
  /** The far ridges on the sea floor (still: never moved). */
  ridge: string;
  /** The rock walls along the two edges (the one layer that follows the scroll). */
  rock: string;
  /** The corals, kelp or glowing tubes on the walls, in turn. */
  decor: readonly [string, string];
  /** The fish crossing the screen. */
  fish: string;
  /** The unit header: white text holds 4.5:1 on it (`dengiz-kontrast.test.ts`). */
  banner: string;
}

/** The CEO-approved mockup's colours (dengiz.html `UBG`, `PAL`, `wall`, `ridges`); the `banner` colours are new, chosen so white text holds on them. */
export const ZONES: Record<ZoneId, ZonePalette> = {
  marjon: {
    top: "#8fe4f6",
    mid: "#5fc0e0",
    bottom: "#5a9fd6",
    ridge: "#8be4ff",
    rock: "#d98aa8",
    decor: ["#ff6f91", "#ffcf4a"],
    fish: "#ffb02e",
    banner: "#0b6a8f",
  },
  kelp: {
    top: "#7fd8dc",
    mid: "#4fb0c4",
    bottom: "#3f8ea0",
    ridge: "#4fc7b8",
    rock: "#5fa898",
    decor: ["#2f9e5a", "#3fae6a"],
    fish: "#ffd166",
    banner: "#1f6b52",
  },
  chuqur: {
    top: "#5f88d0",
    mid: "#5f66b8",
    bottom: "#46408a",
    ridge: "#7a78ff",
    rock: "#5a60a8",
    decor: ["#5ff6ff", "#ff6bf2"],
    fish: "#5ff6ff",
    banner: "#3b3486",
  },
};

/** The glowing tubes' stems (dengiz.html `tube`): a scene colour the contrast test measures too. */
export const TUBE_STEM = "#8a64c4";

/** How deep each zone is, on the unit header's chip (dengiz.html's banners: 5 m, 25 m, 70 m). */
export const ZONE_DEPTH_M: Record<ZoneId, number> = { marjon: 5, kelp: 25, chuqur: 70 };

/** The depth chip is black at this share over the banner: darker still, so its white text holds. */
export const DEPTH_CHIP_ALPHA = 0.25;

/** Dark mode: one still veil over the whole scene instead of a second set of colours. */
export const DARK_VEIL = { color: "#020b1a", alpha: 0.45 } as const;

/** The theme's deep sea blue: the «Boshlash» pill and the current place's ring (white text 7.0:1). */
export const ACCENT = "#0b5f86";

/**
 * Spec §5 `palitraUnitga`: a unit's zone by its order in its level
 * (1 → marjon, 2 → kelp, 3 → chuqur, 4 → marjon …), the same walk as
 * «O'rmon»'s biomes. The path and the unit page both know the order.
 */
export function zoneForUnit(unitOrder: number): ZoneId {
  return ZONE_IDS[unitCycleIndex(unitOrder, ZONE_IDS.length)];
}
