import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { pctText, shareText, unknownCount } from "./audience-format";
import type { AudienceStat } from "./audience-types";

export function AudienceNumbersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Tile({ label, value, note, className }: { label: string; value: string; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg bg-muted/60 p-3", className)}>
      <p className={cn("text-xs", !className && "text-muted-foreground")}>{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className={cn("text-xs", !className && "text-muted-foreground")}>{note}</p>}
    </div>
  );
}

/**
 * Block 1: how many students there are, and how many of them we know the gender of.
 * The counts come first and are always true; a share is a note beside them.
 */
export function AudienceNumbers({ systemTotal, s }: { systemTotal: number; s: AudienceStat }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t("O'quvchilar soni")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label={t("Tizimda jami")} value={formatNumber(systemTotal)} />
          <Tile
            label={t("Faol, dars qilyapti")}
            value={formatNumber(s.total)}
            note={shareText(s.total, systemTotal)}
          />
          <Tile
            label={t("Faolning jinsi aniq")}
            value={formatNumber(s.genderKnown)}
            note={shareText(s.genderKnown, s.total)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            label={t("Erkak")}
            value={formatNumber(s.male)}
            note={t("aniqlarning {pct}", { pct: pctText(s.malePct) })}
            className="bg-primary/10 text-primary"
          />
          <Tile
            label={t("Ayol")}
            value={formatNumber(s.female)}
            note={t("aniqlarning {pct}", { pct: pctText(s.femalePct) })}
            className="bg-orange-500/10 text-orange-700 dark:text-orange-300"
          />
          <Tile
            label={t("Jinsi noma'lum")}
            value={formatNumber(unknownCount(s.total, s.genderKnown))}
            note={t("faolning {pct}", { pct: shareText(unknownCount(s.total, s.genderKnown), s.total) })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Foizlar faqat jinsi aniq {n} kishi ichida hisoblangan.", { n: formatNumber(s.genderKnown) })}
        </p>
      </CardContent>
    </Card>
  );
}
