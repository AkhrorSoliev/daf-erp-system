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
