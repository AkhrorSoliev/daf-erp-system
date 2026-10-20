import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cleanPreset } from "@/components/reports/departed-students/departed-url";
import { keepsMonthCapital } from "@/components/payments/salary-utils";
import { markedText } from "@/components/payments/debt-history/marked-text";
import { useLocale, useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { cardTitle, lessonsText, pctText, previousText } from "./attendance-format";
import type { AttendanceOverview, Counts } from "./attendance-types";

const CHIPS: { key: keyof Counts; label: string; dot: string }[] = [
  { key: "came", label: msg("Keldi"), dot: "bg-success" },
  { key: "late", label: msg("Kechikdi"), dot: "bg-warning" },
  { key: "absent", label: msg("Kelmadi"), dot: "bg-destructive" },
];

export function AttendanceCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-6 w-full" />
      </CardContent>
    </Card>
  );
}

/** Block 1 (spec B7c §4): the rate, the earlier figure, the four marks. Every number is the server's. */
export function AttendanceCard({ data, preset }: { data: AttendanceOverview; preset: string }) {
  const t = useT();
  const { locale } = useLocale();
  // Month names stay lower case where the language writes them so (uz, ru); de and en capitalise them.
  const monthT = (source: string) => (keepsMonthCapital(locale) ? t(source) : t(source).toLowerCase());
  const { card } = data;
  // No marks at all (lessons 0): nothing to say about «darsdan … tasiga».
  const sub = [previousText(preset, data.previous, card.previousRate, t), card.lessons > 0 ? lessonsText(card.lessons, card.attended, t) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">{cardTitle(data.range, t, monthT)}</p>
            <p className="text-3xl font-semibold tabular-nums">{pctText(card.rate)}</p>
            {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
          </div>
          {cleanPreset(preset) === "current_month" && (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("Bosh sahifadagi davomat ham shu raqam")}
            </p>
          )}
        </div>
        <ul aria-label={t("Belgilar")} className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
              <span className={cn("size-2 rounded-full", c.dot)} aria-hidden />
              {t(c.label)} <b className="tabular-nums">{formatNumber(card.counts[c.key])}</b>
            </li>
          ))}
          <li className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm">
            <span>{markedText(t("Sababli **{n}** — foizga kirmaydi", { n: formatNumber(card.counts.excused) }), "tabular-nums")}</span>
          </li>
        </ul>
        {card.counts.cancelled > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("Markaz bekor qilgan darslar: {n} ta — hech bir foizga kirmaydi.", { n: formatNumber(card.counts.cancelled) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
