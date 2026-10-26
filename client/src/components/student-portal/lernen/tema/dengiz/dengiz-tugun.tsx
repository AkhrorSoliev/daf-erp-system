import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";
import { SharTugun, type SharRangi } from "../sahna-qismlari";

/**
 * The orb of each state (dengiz.html `.node.done / .cur / .lock`): a pearl for
 * a finished lesson, a gold lamp for the current one, the pale frosted stone
 * for a locked one (a translucent surface, no backdrop blur — the scene moves
 * under it on every scroll frame). The level colour is not used: the sea has
 * its own light; the sticky banner still shows the level.
 */
export const SHAR: Record<TugunHolat, SharRangi> = {
  done: {
    fon: "radial-gradient(circle at 36% 30%, #ffffff, #f3e6ff 45%, #d9b8fb)",
    soya: "0 8px 20px rgba(0, 0, 0, 0.2), 0 0 26px rgba(243, 226, 255, 0.55)",
    belgi: "#5a2f8f",
  },
  active: {
    fon: "radial-gradient(circle at 36% 30%, #fffbea, #ffe48a 50%, #ffbe55)",
    soya: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 36px rgba(255, 231, 160, 0.8)",
    belgi: "#6b3f00",
  },
  locked: {
    fon: "color-mix(in srgb, var(--surface-card) 72%, transparent)",
    soya: "0 6px 18px rgba(0, 0, 0, 0.13)",
    belgi: "var(--ink-600)",
  },
};

/** The current node's breathing ring (`.dengiz-ring`): a gold halo. */
export const HALQA = "0 0 0 10px rgba(255, 231, 160, 0.55)";

/**
 * «Dengiz»'s path node: the shared orb node (`SharTugun`) in the sea's light.
 * Under «Kam harakat» the ring rests at `opacity: 0`; the current node's own
 * gold fill, its glow and the star still tell it apart.
 */
export function DengizTugun(p: TugunBelgisiProps) {
  return <SharTugun {...p} tema="dengiz" shar={SHAR} halqa={HALQA} />;
}
