"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { averageText, barPercent, responseText, trend } from "./rating-format";
import type { RatingSummary, RatingTeacherBrief } from "./types";

/** «Past baho» chegarasi — kartalar sarlavhasidagi «1–3» bilan bir xil. */
const LOW_SCORE_MAX = 3;
/** Taqsimot yuqoridan pastga: 5 ⭐ → 1 ⭐. */
const SCORES_DESC = [5, 4, 3, 2, 1];

function StatCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const EMPTY_TEXT = "Bu oyda baho yo'q";

/** «Dars baholari» tepasidagi statistika kartalari. Barcha raqamlar serverdan. */
export function RatingSummaryCards({
  data,
  onOpenTeacher,
}: {
  data: RatingSummary;
  onOpenTeacher: (teacherId: number) => void;
}) {
  const { totals } = data;
  const t = trend(totals.average, data.previousAverage);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="O'rtacha baho">
          <p className="text-2xl font-semibold">{averageText(totals.average)}</p>
          {t && (
            <p
              className={cn(
                "text-xs",
                t.tone === "up" && "text-green-600",
                t.tone === "down" && "text-destructive",
              )}
            >
              {t.text} — o&apos;tgan oyga nisbatan
            </p>
          )}
        </StatCard>
        <StatCard title="Yuborilgan so'rovlar">
          <p className="text-2xl font-semibold">{formatNumber(totals.delivered)}</p>
          <p className="text-xs text-muted-foreground">shu oy xabar yetgan o&apos;quvchilar</p>
        </StatCard>
        <StatCard title="Javob berganlar">
          <p className="text-2xl font-semibold">
            {responseText(totals.rated, totals.delivered, totals.responseRate)}
          </p>
          <p className="text-xs text-muted-foreground">xabar yetganlardan</p>
        </StatCard>
        <StatCard title="Past baholar (1–3)">
          <p className={cn("text-2xl font-semibold", totals.low > 0 && "text-destructive")}>
            {formatNumber(totals.low)}
          </p>
          <p className="text-xs text-muted-foreground">
            {totals.low === 0
              ? "past baho yo'q"
              : `${formatNumber(data.lowCommented)} tasida izoh bor`}
          </p>
        </StatCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard title="Baholar taqsimoti">
          <Distribution counts={data.distribution} />
        </StatCard>
        <StatCard title="Ustozlar">
          {data.best ? (
            <div className="space-y-2">
              <TeacherLine label="Eng yaxshi" teacher={data.best} onOpen={onOpenTeacher} />
              {data.worst && (
                <TeacherLine label="Eng past" teacher={data.worst} onOpen={onOpenTeacher} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>
          )}
        </StatCard>
      </div>
    </div>
  );
}

function Distribution({ counts }: { counts: number[] }) {
  const max = Math.max(0, ...counts);
  if (max === 0) return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>;
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

function TeacherLine({
  label,
  teacher,
  onOpen,
}: {
  label: string;
  teacher: RatingTeacherBrief;
  onOpen: (teacherId: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <button
        type="button"
        className="rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(teacher.teacherId)}
      >
        {teacher.name}
      </button>
      <span>{averageText(teacher.average)}</span>
      <span className="text-muted-foreground">· {formatNumber(teacher.rated)} ta baho</span>
    </div>
  );
}
