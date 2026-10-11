import { cn } from "@/lib/utils";
import { punktAufKreis, zeigerWinkel } from "./uhr-zeiger";

const STUNDEN = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTEN = Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 5 !== 0);

export interface UhrProps {
  /** `HH:MM`; anything else draws nothing. */
  zeit: string;
  className?: string;
  /**
   * Never the time in words: a screen reader would read the answer out.
   * The picker passes «1-variant» etc.
   */
  label?: string;
}

/**
 * An analogue clock drawn in SVG — no picture files. Numbers 1–12 help an
 * A1 student; the hour hand moves with the minutes (`zeigerWinkel`), so
 * «halb vier» really stands between 3 and 4. Colours follow the text
 * colour (`currentColor`) and the card background, so the clock reads in
 * both themes and in both the student portal and the admin panel.
 */
export function Uhr({ zeit, className, label = "Soat" }: UhrProps) {
  const winkel = zeigerWinkel(zeit);
  if (!winkel) return null;
  // Both hands stop short of the numbers (r 33), so no number is hidden.
  const stundeEnde = punktAufKreis(winkel.stunde, 19);
  const minuteEnde = punktAufKreis(winkel.minute, 28);
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label} className={cn("aspect-square", className)}>
      <circle cx="50" cy="50" r="47" className="fill-card stroke-current" strokeWidth="2.5" />
      {MINUTEN.map((m) => {
        const a = punktAufKreis(m * 6, 44);
        const b = punktAufKreis(m * 6, 41.5);
        return (
          <line
            key={m}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className="stroke-current"
            strokeOpacity={0.35}
            strokeWidth="0.8"
          />
        );
      })}
      {STUNDEN.map((h) => {
        const a = punktAufKreis(h * 30, 44);
        const b = punktAufKreis(h * 30, 39.5);
        const t = punktAufKreis(h * 30, 33);
        return (
          <g key={h}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-current" strokeWidth="2" strokeLinecap="round" />
            <text
              x={t.x}
              y={t.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-current font-bold"
              fontSize="8.5"
            >
              {h}
            </text>
          </g>
        );
      })}
      <line
        x1="50"
        y1="50"
        x2={stundeEnde.x}
        y2={stundeEnde.y}
        className="stroke-current"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="50"
        x2={minuteEnde.x}
        y2={minuteEnde.y}
        className="stroke-current"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="3.5" className="fill-current" />
    </svg>
  );
}
