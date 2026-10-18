"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
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
  const t = useT();
  const { totals } = data;
  const tr = trend(totals.average, data.previousAverage, t);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("O'rtacha baho")}>
          <p className="text-2xl font-semibold">{averageText(totals.average)}</p>
          {tr && (
            <p
              className={cn(
                "text-xs",
                tr.tone === "up" && "text-green-600",
                tr.tone === "down" && "text-destructive",
              )}
            >
              {tr.text} — {t("o'tgan oyga nisbatan")}
            </p>
          )}
        </StatCard>
        <StatCard title={t("Yuborilgan so'rovlar")}>
          <p className="text-2xl font-semibold">{formatNumber(totals.delivered)}</p>
          <p className="text-xs text-muted-foreground">{t("shu oy xabar yetgan o'quvchilar")}</p>
        </StatCard>
        <StatCard title={t("Javob berganlar")}>
          <p className="text-2xl font-semibold">
            {responseText(totals.rated, totals.delivered, totals.responseRate)}
          </p>
          <p className="text-xs text-muted-foreground">{t("xabar yetganlardan")}</p>
        </StatCard>
        <StatCard title={t("Izoh yozganlar")}>
          <p className="text-2xl font-semibold">
            {formatNumber(data.lowCommented)} / {formatNumber(totals.low)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("past baho qo'yganlardan (izoh faqat 1–3 da so'raladi)")}
          </p>
        </StatCard>
      </div>
      <RatingDistributionCard data={data} onOpenTeacher={onOpenTeacher} />
    </div>
  );
}
