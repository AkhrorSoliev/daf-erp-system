import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { mlnText, pctText } from "./center-activity-format";
import type { CenterOverview } from "./center-activity-types";

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function CenterActivityCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

/** The three cards (spec B7b §4). Every number is the server's. */
export function CenterActivityCards({ cards }: { cards: CenterOverview["cards"] }) {
  const t = useT();
  const hours = t("haftasiga {n} soat dars", { n: formatNumber(cards.lessonHoursPerWeek) });
  const workWindow = cards.workWindow
    ? ` · ${t("ish vaqti {start}–{end}, du–sha", { start: cards.workWindow.start, end: cards.workWindow.end })}`
    : "";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        title={t("Xonalar bandligi")}
        value={pctText(cards.occupancyPct)}
        sub={`${hours}${workWindow}`}
      />
      <Stat
        title={t("Guruhlar to'lganligi")}
        value={pctText(cards.seats.pct)}
        sub={`${t("{n} o'quvchi", { n: formatNumber(cards.seats.enrolled) })} · ${t("{n} o'rin", { n: formatNumber(cards.seats.capacity) })}`}
      />
      <Stat
        title={t("Bo'sh o'rinlar")}
        value={t("{n} ta", { n: formatNumber(cards.free.seats) })}
        sub={
          cards.free.revenue > 0
            ? t("mavjud guruhlarda · to'lsa, oyiga taxminan {amount} qo'shimcha", { amount: mlnText(cards.free.revenue, t) })
            : t("mavjud guruhlarda")
        }
      />
    </div>
  );
}
