import { Card, CardContent } from "@/components/ui/card";
import { monthShort } from "@/components/reports/departed-students/departed-format";
import { keepsMonthCapital } from "@/components/payments/salary-utils";
import { useLocale, useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { pctText } from "./center-activity-format";
import type { CenterOverview } from "./center-activity-types";

/** «Oylar bo'yicha bandlik» (spec B7b §4): the same figure as the card, month by month. */
export function CenterActivityMonths({ months, selected }: { months: CenterOverview["months"]; selected: string }) {
  const t = useT();
  const { locale } = useLocale();
  // Month names stay lower case where the language writes them so (uz, ru); de and en capitalise them.
  const monthT = (source: string) => (keepsMonthCapital(locale) ? t(source) : t(source).toLowerCase());
  const top = Math.max(1, ...months.map((m) => m.pct ?? 0));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="font-medium">{t("Oylar bo'yicha bandlik")}</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, months.length)}, minmax(0, 1fr))` }}>
          {months.map((m) => (
            <div key={m.month} className="flex flex-col items-center gap-1">
              <span className="shrink-0 text-xs font-semibold">{pctText(m.pct)}</span>
              {/* A fixed-height box: each bar is a share of it, so the label rows cannot squeeze the bars. */}
              <div className="flex h-32 w-full items-end justify-center">
                <div
                  className={cn("min-h-1 w-full max-w-10 rounded-t-md", m.month === selected ? "bg-primary" : "bg-primary/35")}
                  style={{ height: `${((m.pct ?? 0) / top) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{monthShort(m.month, monthT)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("O'tgan oylarda keyin yopilgan yoki o'chirilgan guruhlar ham hisobga olinadi.")}
        </p>
      </CardContent>
    </Card>
  );
}
