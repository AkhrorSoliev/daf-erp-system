import { Card, CardContent } from "@/components/ui/card";
import { monthFull, monthShort } from "@/components/reports/departed-students/departed-format";
import { cn } from "@/lib/utils";
import { TONE_BAR, pctText, rateTone, weekdayName } from "./attendance-format";
import type { AttendanceOverview } from "./attendance-types";

/** Block 2 (spec §4): month columns and weekday bars, both the server's figures. */
export function AttendanceTrends({ months, weekdays }: Pick<AttendanceOverview, "months" | "weekdays">) {
  const spoken = months.map((m) => `${monthFull(m.month)} ${pctText(m.rate)}`).join(", ");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Oylar bo&apos;yicha</p>
          <div role="img" aria-label={`Davomat: ${spoken}`} className="flex h-40 items-end gap-2">
            {months.map((m) => (
              <div key={m.month} className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1", m.partial && "opacity-60")}>
                <span className="text-xs font-medium tabular-nums">{pctText(m.rate)}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className={cn("w-full rounded-t-md", m.rate === null ? "min-h-px bg-muted" : "bg-primary")} style={{ height: `${m.rate ?? 0}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{monthShort(m.month)}</span>
              </div>
            ))}
          </div>
          {months.some((m) => m.partial) && <p className="text-xs text-muted-foreground">Och rangdagi oy hali tugamagan.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Hafta kunlari</p>
          <ul aria-label="Hafta kunlari bo'yicha davomat" className="flex flex-col gap-2">
            {weekdays.map((w) => (
              <li key={w.day} aria-label={`${weekdayName(w.day)}: ${pctText(w.rate)}`} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span aria-hidden>{weekdayName(w.day)}</span>
                <div className="h-2 rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-2 rounded-full", TONE_BAR[rateTone(w.rate)])} style={{ width: `${w.rate ?? 0}%` }} />
                </div>
                <b className="text-right tabular-nums" aria-hidden>{pctText(w.rate)}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">80% dan past — sariq, 75% dan past — qizil.</p>
        </CardContent>
      </Card>
    </div>
  );
}
