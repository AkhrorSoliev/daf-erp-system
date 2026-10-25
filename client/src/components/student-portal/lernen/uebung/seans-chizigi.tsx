import { cn } from "@/lib/utils";

/**
 * Share of the session's questions done, 0–100. The bar takes a percent, not
 * a fraction: 4 of 12 done is 33 %, not 4 %. A count that is not a finite
 * number (NaN, Infinity) reads as nothing done, never as an invalid width.
 */
export function chiziqFoizi(tugatilgan: number, jami: number): number {
  if (!Number.isFinite(tugatilgan) || !Number.isFinite(jami) || jami <= 0) return 0;
  return Math.max(0, Math.min(100, (tugatilgan / jami) * 100));
}

/**
 * The exercise header's progress bar (duo.html `.pb`): 16 px, coral, a light
 * gloss stripe, and a fill that eases with a small overshoot (the track clips
 * it). Under reduced motion — the system's, or the device's «Kam harakat»
 * that the session root marks with `data-kam-harakat` — the fill jumps.
 */
export function SeansChizigi({
  tugatilgan,
  jami,
  className,
}: {
  tugatilgan: number;
  jami: number;
  className?: string;
}) {
  const foiz = chiziqFoizi(tugatilgan, jami);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(foiz)}
      className={cn("inset-well h-4 overflow-hidden rounded-pill bg-sunk", className)}
    >
      <span
        className={cn(
          "relative block h-full overflow-hidden rounded-pill bg-coral-500",
          "transition-[width] duration-500 ease-[cubic-bezier(.3,1.2,.4,1)]",
          "motion-reduce:transition-none in-data-[kam-harakat]:transition-none",
        )}
        style={{ width: `${foiz}%` }}
      >
        <span aria-hidden className="absolute inset-x-2 top-1 h-1 rounded-pill bg-white/25" />
      </span>
    </div>
  );
}
