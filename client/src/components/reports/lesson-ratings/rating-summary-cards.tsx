"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { averageText, responseText, trend } from "./rating-format";
import { RatingDistributionCard } from "./rating-distribution-card";
import type { RatingSummary } from "./types";

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
        <StatCard title="Izoh yozganlar">
          <p className="text-2xl font-semibold">
            {formatNumber(data.lowCommented)} / {formatNumber(totals.low)}
          </p>
          <p className="text-xs text-muted-foreground">
            past baho qo&apos;yganlardan (izoh faqat 1–3 da so&apos;raladi)
          </p>
        </StatCard>
      </div>
      <RatingDistributionCard data={data} onOpenTeacher={onOpenTeacher} />
    </div>
  );
}
