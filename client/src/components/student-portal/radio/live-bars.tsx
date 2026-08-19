import { cn } from "@/lib/utils";

export interface LiveBarsProps {
  /** Bars animate only while the stream is actually running. */
  active: boolean;
  className?: string;
}

/**
 * Three-bar equaliser. Live radio has no duration and no progress, so this is
 * the only continuous signal that audio is flowing — a paused stream and a
 * playing one are otherwise identical on screen. Colour is inherited from the
 * parent so it can sit on a tinted tile or on white.
 */
export function LiveBars({ active, className }: LiveBarsProps) {
  return (
    <span
      className={cn("inline-flex h-3.5 items-end gap-[3px]", className)}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-current",
            i === 1 ? "h-3.5" : "h-2.5",
            active ? "radio-bar" : "origin-bottom scale-y-[0.35]",
          )}
        />
      ))}
    </span>
  );
}
