import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { capitalize, monthFull, monthShort } from "./departed-format";
import type { DepartedOverview } from "./departed-types";
import { useLocale, useT } from "@/i18n/context";
import { keepsMonthCapital } from "@/components/payments/salary-utils";

/** The last months as columns (spec B7a §4.3); an unfinished month (still inside the return window) is faint. */
export function DepartedMonths({ months, isLoading }: { months: DepartedOverview["months"] | undefined; isLoading?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  // Month names stay lower case where the language writes them so (uz, ru); de and en capitalise them.
  const monthT = (source: string) => (keepsMonthCapital(locale) ? t(source) : t(source).toLowerCase());
  if (isLoading || !months) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }
  const max = Math.max(...months.map((m) => m.departed), 0);
  const spoken = months.map((m) => `${monthFull(m.key, monthT)} ${m.departed}`).join(", ");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t("Oylar bo'yicha")}</p>
        {months.length === 0 && <p className="text-sm text-muted-foreground">{t("Tizim ishga tushgan sanadan oldingi davrlar ko'rsatilmaydi.")}</p>}
        <div role="img" aria-label={capitalize(spoken)} className={cn("flex h-40 items-end gap-2", months.length === 0 && "hidden")}>
          {months.map((m) => (
            <div key={m.key} className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1", m.provisional && "opacity-50")}>
              <span className="text-xs font-medium tabular-nums">{m.departed}</span>
              <div className="w-full flex-1 flex items-end">
                <div className={cn("w-full rounded-t-md", m.departed === 0 ? "min-h-px bg-muted" : "bg-primary")} style={{ height: `${max > 0 ? (m.departed / max) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{monthShort(m.key, monthT)}</span>
            </div>
          ))}
        </div>
        {months.some((m) => m.provisional) && (
          <p className="text-xs text-muted-foreground">{t("Och rangdagi oylar dastlabki: qaytish muddati tugamagan.")}</p>
        )}
      </CardContent>
    </Card>
  );
}
