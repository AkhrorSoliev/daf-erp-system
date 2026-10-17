import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { barWidth, pctText } from "./audience-format";
import type { AgeBandRow } from "./audience-types";

/** Block 3: age groups as bars. Counts and shares are the server's; a share is a dash while too few ages are known. */
export function AudienceBands({ bands }: { bands: AgeBandRow[] }) {
  const top = bands.reduce<AgeBandRow | null>((best, b) => (b.pct !== null && (best === null || b.count > best.count) ? b : best), null);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Yosh guruhlari</p>
        <ul aria-label="Yosh guruhlari bo'yicha o'quvchilar" className="flex flex-col gap-2">
          {bands.map((b) => (
            <li key={b.key} aria-label={`${b.label}: ${formatNumber(b.count)} kishi, ${pctText(b.pct)}`} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-sm">
              <span aria-hidden>{b.label}</span>
              <div className="h-3 rounded-full bg-muted" aria-hidden>
                <div className="h-3 rounded-full bg-primary" style={{ width: barWidth(b.pct) }} />
              </div>
              <span className="text-right tabular-nums" aria-hidden>
                {formatNumber(b.count)} · <b>{pctText(b.pct)}</b>
              </span>
            </li>
          ))}
        </ul>
        {top && <p className="text-xs text-muted-foreground">Eng ko&apos;p: {top.label} yosh, {pctText(top.pct)}.</p>}
      </CardContent>
    </Card>
  );
}
