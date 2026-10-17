import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { capitalize, formatPer100, formatStudyMonths, rangeLabel } from "./departed-format";
import type { DepartedOverview } from "./departed-types";

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
        label={`${capitalize(rangeLabel(data.range))} ketdi`}
        value={`${formatNumber(cards.departed)} o'quvchi`}
        sub={cards.previousDeparted === null ? null : `${previousLabel} ${formatNumber(cards.previousDeparted)} edi`}
      />
      <Figure
        label="Har 100 o'quvchidan"
        value={cards.atStart === 0 ? "—" : `${formatPer100(cards.per100)} tasi ketdi`}
        sub={cards.atStart === 0 ? "davr boshida o'qiyotgan o'quvchi yo'q edi" : `davr boshida ${formatNumber(cards.atStart)} o'quvchi o'qiyotgan edi`}
      />
      <Figure label="Ketguncha o'qidi" value={formatStudyMonths(cards.avgStudyMonths)} sub="o'rtacha" />
    </div>
  );
}
