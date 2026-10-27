import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";
import { SharTugun, type SharRangi } from "../sahna-qismlari";

/**
 * The orb of each state (ormon2.html `.node.done / .cur / .lock`): lit gold, a
 * mint glow, a pale frosted stone (a translucent surface, no backdrop blur —
 * the scene moves under it on every scroll frame). The level colour is not
 * used: the forest has its own light; the sticky banner still shows the level.
 */
export const SHAR: Record<TugunHolat, SharRangi> = {
  done: {
    fon: "radial-gradient(circle at 36% 30%, #fff6d4, #f2cd7a 60%, #e2ae52)",
    soya: "0 8px 20px rgba(0, 0, 0, 0.2), 0 0 26px rgba(255, 227, 160, 0.4)",
    belgi: "#6b4a10",
  },
  active: {
    fon: "radial-gradient(circle at 36% 30%, #f0fffb, #86ead2 60%, #4fcdb3)",
    soya: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 36px rgba(166, 253, 232, 0.67)",
    belgi: "#0d4a3d",
  },
  locked: {
    fon: "color-mix(in srgb, var(--surface-card) 72%, transparent)",
    soya: "0 6px 18px rgba(0, 0, 0, 0.13)",
    belgi: "var(--ink-600)",
  },
};

/** The current node's breathing ring (`.ormon-ring`): a mint halo. */
const HALQA = "0 0 0 10px rgba(166, 253, 232, 0.55)";

/**
 * «O'rmon»'s path node: the shared orb node (`SharTugun`) in the forest's
 * light. Under «Kam harakat» the ring rests at `opacity: 0`; the current
 * node's own mint fill, mint glow and star still tell it apart.
 */
export function OrmonTugun(p: TugunBelgisiProps) {
  return <SharTugun {...p} tema="ormon" shar={SHAR} halqa={HALQA} />;
}
