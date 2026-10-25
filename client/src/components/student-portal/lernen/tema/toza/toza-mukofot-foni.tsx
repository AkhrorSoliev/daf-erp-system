import type { MukofotFoniProps } from "../tema-turlari";

/** «Toza»: a plain coral tint behind the reward; the celebration itself is theme-independent. */
export function TozaMukofotFoni({ children }: MukofotFoniProps) {
  return <div className="relative rounded-[28px] bg-coral-500/10 px-4 py-6">{children}</div>;
}
