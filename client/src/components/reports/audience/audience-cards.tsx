import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { ageText, coverageText, pctText } from "./audience-format";
import type { AudienceStat } from "./audience-types";

export function AudienceCardsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}

/** Block 1: how much of the page stands on real answers. Every count is the server's. */
export function AudienceCoverage({ s }: { s: AudienceStat }) {
  const rows = [
    { label: "Jinsi", known: s.genderKnown },
    { label: "Yoshi", known: s.ageKnown },
  ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Ma&apos;lumot qanchalik to&apos;liq</p>
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[3.5rem_1fr_9.5rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <div className="h-3 rounded-full bg-muted" role="img" aria-label={`${r.label}: ${coverageText(r.known, s.total)}`}>
              <div className="h-3 rounded-full bg-primary" style={{ width: `${s.total === 0 ? 0 : (r.known / s.total) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums">{coverageText(r.known, s.total)}</span>
          </div>
        ))}
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          Foizlar faqat ma&apos;lumot kiritganlar ichida hisoblangan. O&apos;quvchilar ilovaga kirgan sari ma&apos;lumot to&apos;lib boradi.
        </p>
      </CardContent>
    </Card>
  );
}

/** Block 2: the gender split and the average age. A share the server left out prints a dash. */
export function AudienceHeadline({ s }: { s: AudienceStat }) {
  const known = s.malePct !== null && s.femalePct !== null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Jins</p>
          <div className="flex h-6 gap-0.5 overflow-hidden rounded-md bg-muted" role="img" aria-label={`Erkak ${pctText(s.malePct)}, ayol ${pctText(s.femalePct)}`}>
            {known && (
              <>
                <div className="bg-primary" style={{ width: `${s.malePct}%` }} />
                <div className="bg-orange-500" style={{ width: `${s.femalePct}%` }} />
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
              Erkak <b className="tabular-nums">{pctText(s.malePct)}</b>
              <span className="text-muted-foreground tabular-nums">({formatNumber(s.male)})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-orange-500" aria-hidden />
              Ayol <b className="tabular-nums">{pctText(s.femalePct)}</b>
              <span className="text-muted-foreground tabular-nums">({formatNumber(s.female)})</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Noma&apos;lum: {formatNumber(s.total - s.genderKnown)} kishi</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">O&apos;rtacha yosh</p>
          <p className="text-4xl font-semibold tabular-nums">{ageText(s.avgAge)}</p>
          <p className="text-xs text-muted-foreground">
            {formatNumber(s.ageKnown)} kishi asosida · Noma&apos;lum: {formatNumber(s.total - s.ageKnown)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
