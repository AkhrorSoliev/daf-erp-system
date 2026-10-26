/**
 * A scene layer's offset for a scroll position (spec §5): it moves `factor` px
 * up for every px scrolled and wraps every `tile`, so a layer of a few tiles
 * covers a path of any length. Always in `(-tile, 0]`.
 */
export function layerOffset(scrollY: number, factor: number, tile: number): number {
  const v = (((scrollY * factor) % tile) + tile) % tile;
  return v === 0 ? 0 : -v;
}

/** Parallax and the drifting decor hold still while the tab is hidden or the scene is off screen (spec §5). */
export function scenePaused(q: { hidden: boolean; offscreen: boolean }): boolean {
  return q.hidden || q.offscreen;
}

/**
 * What the parallax does with the layers: `off` — there is no parallax («Kam
 * harakat», the system setting), they rest at 0; `paused` — the scene is hidden
 * or off screen, they keep their last offset, so on the way back there is no
 * snap; `follows` — they move with the scroll.
 */
export function parallaxMode(q: { parallax: boolean; paused: boolean }): "off" | "paused" | "follows" {
  if (!q.parallax) return "off";
  return q.paused ? "paused" : "follows";
}
