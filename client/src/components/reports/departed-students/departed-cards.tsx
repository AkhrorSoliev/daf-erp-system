import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { capitalize, formatPer100, formatStudyMonths, rangeLabel } from "./departed-format";
import type { DepartedOverview } from "./departed-types";
import { useT } from "@/i18n/context";

function Figure({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">{value}</p>
        {sub !== null && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** The three cards of the page (spec B7a §4.1). `previousLabel` names the period before, e.g. «avgustda». */
export function DepartedCards({ data, previousLabel, isLoading }: { data: DepartedOverview | undefined; previousLabel: string; isLoading: boolean }) {
  const t = useT();
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }
  const { cards } = data;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Figure
        label={capitalize(t("{period} ketdi", { period: rangeLabel(data.range, t) }))}
        value={t("{n} o'quvchi", { n: formatNumber(cards.departed) })}
        sub={cards.previousDeparted === null ? null : t("{period} {n} edi", { period: previousLabel, n: formatNumber(cards.previousDeparted) })}
      />
      <Figure
        label={t("Har 100 o'quvchidan")}
        value={cards.atStart === 0 ? "—" : t("{n} tasi ketdi", { n: formatPer100(cards.per100) })}
        sub={cards.atStart === 0 ? t("davr boshida o'qiyotgan o'quvchi yo'q edi") : t("davr boshida {n} o'quvchi o'qiyotgan edi", { n: formatNumber(cards.atStart) })}
      />
      <Figure label={t("Ketguncha o'qidi")} value={formatStudyMonths(cards.avgStudyMonths, t)} sub={t("o'rtacha")} />
    </div>
  );
}
