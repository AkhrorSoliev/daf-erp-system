import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import type { DepartedOverview } from "./departed-types";
import { useT } from "@/i18n/context";

// The server's reason name (data), compared, never drawn as a text of ours.
const OTHER = "Boshqa sabab";

/** Why they left, as bars (spec B7a §4.3); «Sabab yozilmagan» always last. */
export function DepartedReasons({ reasons, isLoading, onReadComments }: {
  reasons: DepartedOverview["reasons"] | undefined;
  isLoading?: boolean;
  onReadComments: (reasonId: string | null) => void;
}) {
  const t = useT();
  if (isLoading || !reasons) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6" />)}
        </CardContent>
      </Card>
    );
  }
  // Biggest first (stable on ties); the unwritten reason goes last.
  const rows = [...reasons].sort((a, b) => Number(a.reasonId === null) - Number(b.reasonId === null) || (a.reasonId !== null ? b.count - a.count : 0));
  const max = Math.max(...rows.map((r) => r.count), 0);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">{t("Nega ketishdi")}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bu davrda ketgan o'quvchi yo'q")}</p>
        ) : (
          rows.map((r) => (
            <div key={r.reasonId ?? "none"} className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate" title={r.name}>{r.name}</span>
                <div className="h-2.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }} />
                </div>
                <b className="tabular-nums">{formatNumber(r.count)}</b>
              </div>
              {r.name === OTHER && (
                <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => onReadComments(r.reasonId)}>
                  {t("«Boshqa sabab» izohlarini o'qish")}
                  <ArrowRight />
                </Button>
              )}
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">{t("Chetlatilgan o'quvchining sababi uning kartasidan olinadi.")}</p>
      </CardContent>
    </Card>
  );
}
