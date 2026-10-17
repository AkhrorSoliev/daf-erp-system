import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pctText } from "./center-activity-format";
import type { CenterOverview } from "./center-activity-types";

const MONTH_NAME = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const monthName = (key: string) => MONTH_NAME[Number(key.slice(5, 7)) - 1];

/** «Oylar bo'yicha bandlik» (spec B7b §4): the same figure as the card, month by month. */
export function CenterActivityMonths({ months, selected }: { months: CenterOverview["months"]; selected: string }) {
  const top = Math.max(1, ...months.map((m) => m.pct ?? 0));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="font-medium">Oylar bo&apos;yicha bandlik</h3>
        <div className="grid items-end gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, height: 150 }}>
          {months.map((m) => (
            <div key={m.month} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="text-xs font-semibold">{pctText(m.pct)}</span>
              <div
                className={cn("w-full max-w-10 rounded-t-md", m.month === selected ? "bg-primary" : "bg-primary/35")}
                style={{ height: `${((m.pct ?? 0) / top) * 100}%`, minHeight: 2 }}
              />
              <span className="text-xs text-muted-foreground">{monthName(m.month)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O&apos;tgan oylarda keyin yopilgan yoki o&apos;chirilgan guruhlar ham hisobga olinadi.
        </p>
      </CardContent>
    </Card>
  );
}
