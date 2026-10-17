import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  const window = cards.workWindow ? ` · ish vaqti ${cards.workWindow.start}–${cards.workWindow.end}, du–sha` : "";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        title="Xonalar bandligi"
        value={pctText(cards.occupancyPct)}
        sub={`haftasiga ${formatNumber(cards.lessonHoursPerWeek)} soat dars${window}`}
      />
      <Stat
        title="Guruhlar to'lganligi"
        value={pctText(cards.seats.pct)}
        sub={`${formatNumber(cards.seats.enrolled)} o'quvchi · ${formatNumber(cards.seats.capacity)} o'rin`}
      />
      <Stat
        title="Bo'sh o'rinlar"
        value={`${formatNumber(cards.free.seats)} ta`}
        sub={
          cards.free.revenue > 0
            ? `mavjud guruhlarda · to'lsa, oyiga taxminan ${mlnText(cards.free.revenue)} qo'shimcha`
            : "mavjud guruhlarda"
        }
      />
    </div>
  );
}
