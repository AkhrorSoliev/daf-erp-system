"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { averageText, barPercent } from "./rating-format";
import type { RatingSummary, RatingTeacherBrief } from "./types";

/** «Past baho» chegarasi — past baholar qizil chiziq bilan. */
const LOW_SCORE_MAX = 3;
/** Taqsimot yuqoridan pastga: 5 ⭐ → 1 ⭐. */
const SCORES_DESC = [5, 4, 3, 2, 1];
const EMPTY_TEXT = msg("Bu oyda baho yo'q");

/** Chapda taqsimot (3/5), o'ngda eng yaxshi / eng past ustoz (2/5). */
export function RatingDistributionCard({
  data,
  onOpenTeacher,
}: {
  data: RatingSummary;
  onOpenTeacher: (teacherId: number) => void;
}) {
  const t = useT();
  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-5 lg:gap-0">
        <div className="lg:col-span-3 lg:pr-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Baholar taqsimoti")}
            </CardTitle>
          </CardHeader>
          <Distribution counts={data.distribution} />
        </div>
        <div className="space-y-4 border-t pt-4 lg:col-span-2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {data.best ? (
            <>
              <TeacherBlock label={t("Eng yaxshi ustoz")} teacher={data.best} onOpen={onOpenTeacher} />
              {data.worst && (
                <TeacherBlock label={t("Eng past ustoz")} teacher={data.worst} onOpen={onOpenTeacher} />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t(EMPTY_TEXT)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Distribution({ counts }: { counts: number[] }) {
  const t = useT();
  const max = Math.max(0, ...counts);
  if (max === 0) return <p className="text-sm text-muted-foreground">{t(EMPTY_TEXT)}</p>;
  return (
    <ul className="space-y-2">
      {SCORES_DESC.map((score) => {
        const count = counts[score - 1] ?? 0;
        return (
          <li key={score} className="flex items-center gap-3 text-sm">
            <span className="w-10 shrink-0">{score} ⭐</span>
            <div aria-hidden="true" className="h-2 flex-1 rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  score <= LOW_SCORE_MAX ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: barPercent(count, max) }}
              />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums">{formatNumber(count)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TeacherBlock({
  label,
  teacher,
  onOpen,
}: {
  label: string;
  teacher: RatingTeacherBrief;
  onOpen: (teacherId: number) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">{label}</p>
      <button
        type="button"
        className="rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(teacher.teacherId)}
      >
        {teacher.name}
      </button>
      <p>
        {averageText(teacher.average)}{" "}
        <span className="text-muted-foreground">· {t("{n} ta baho", { n: formatNumber(teacher.rated) })}</span>
      </p>
    </div>
  );
}
