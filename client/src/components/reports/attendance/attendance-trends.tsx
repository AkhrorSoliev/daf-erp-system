import { Card, CardContent } from "@/components/ui/card";
import { monthShort } from "@/components/reports/departed-students/departed-format";
import { keepsMonthCapital } from "@/components/payments/salary-utils";
import { useLocale, useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { TONE_BAR, monthSpoken, pctText, rateTone, weekdayName } from "./attendance-format";
import type { AttendanceOverview } from "./attendance-types";

/** Block 2 (spec §4): month columns and weekday bars, both the server's figures. */
export function AttendanceTrends({ months, weekdays }: Pick<AttendanceOverview, "months" | "weekdays">) {
  const t = useT();
  const { locale } = useLocale();
  // Month names stay lower case where the language writes them so (uz, ru); de and en capitalise them.
  const monthT = (source: string) => (keepsMonthCapital(locale) ? t(source) : t(source).toLowerCase());
  const spoken = months.map((m) => monthSpoken(m, t, monthT)).join(", ");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t("Oylar bo'yicha")}</p>
          <div role="img" aria-label={t("Davomat: {months}", { months: spoken })} className="flex h-40 items-end gap-2">
            {months.map((m) => (
              <div key={m.month} className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1", m.partial && "opacity-60")}>
                <span className="text-xs font-medium tabular-nums">{pctText(m.rate)}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className={cn("w-full rounded-t-md", m.rate === null ? "min-h-px bg-muted" : "bg-primary")} style={{ height: `${m.rate ?? 0}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {monthShort(m.month, monthT)}
                  {m.partial && <span aria-hidden>*</span>}
                </span>
              </div>
            ))}
          </div>
          {months.some((m) => m.partial) && <p className="text-xs text-muted-foreground">{t("* Och rangdagi oy hali tugamagan.")}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("Hafta kunlari")}</p>
          <ul aria-label={t("Hafta kunlari bo'yicha davomat")} className="flex flex-col gap-2">
            {weekdays.map((w) => (
              <li key={w.day} aria-label={`${weekdayName(w.day, t)}: ${pctText(w.rate)}`} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span aria-hidden>{weekdayName(w.day, t)}</span>
                <div className="h-2 rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-2 rounded-full", TONE_BAR[rateTone(w.rate)])} style={{ width: `${w.rate ?? 0}%` }} />
                </div>
                <b className="text-right tabular-nums" aria-hidden>{pctText(w.rate)}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("80% dan past — sariq, 75% dan past — qizil.")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
