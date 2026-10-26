import type { MukofotFoniProps } from "../tema-turlari";
import { SahnaMukofotFoni } from "../sahna-qismlari";

/**
 * «O'rmon»: the reward stands in a forest clearing (ormon2.html `.rew`) — the
 * shared reward background in the `--ormon-*` tokens: a soft radial light, a
 * hill at the bottom and, for a celebration, a slow sunburst.
 */
export function OrmonMukofotFoni(p: MukofotFoniProps) {
  return <SahnaMukofotFoni {...p} tema="ormon" />;
}
