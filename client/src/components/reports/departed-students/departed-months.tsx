import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { capitalize, monthFull, monthShort } from "./departed-format";
import type { DepartedOverview } from "./departed-types";

/** The last months as columns (spec B7a §4.3); an unfinished month (still inside the return window) is faint. */
export function DepartedMonths({ months, isLoading }: { months: DepartedOverview["months"] | undefined; isLoading?: boolean }) {
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
  const spoken = months.map((m) => `${monthFull(m.key)} ${m.departed}`).join(", ");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Oylar bo&apos;yicha</p>
        <div role="img" aria-label={capitalize(spoken)} className="flex h-40 items-end gap-2">
          {months.map((m) => (
            <div key={m.key} className={cn("flex h-full flex-1 flex-col items-center justify-end gap-1", m.provisional && "opacity-50")}>
              <span className="text-xs font-medium tabular-nums">{m.departed}</span>
              <div className="w-full flex-1 flex items-end">
                <div className="w-full rounded-t-md bg-primary" style={{ height: `${max > 0 ? (m.departed / max) * 100 : 0}%` }} />
              </div>
              <em className="text-xs not-italic text-muted-foreground">{monthShort(m.key)}</em>
            </div>
          ))}
        </div>
        {months.some((m) => m.provisional) && (
          <p className="text-xs text-muted-foreground">Och rangdagi oylar dastlabki: qaytish muddati tugamagan.</p>
        )}
      </CardContent>
    </Card>
  );
}
