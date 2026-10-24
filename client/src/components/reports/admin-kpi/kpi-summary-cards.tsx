"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/context";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format-utils";
import { TrendLine } from "./kpi-trend";
import type { KpiOverview } from "./kpi-types";

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

/** The cards of spec §7.7, each with its ▲/▼ (only when the compare month has data); the forecast only in the current month. */
export function KpiSummaryCards({ data, isCurrent }: { data: KpiOverview; isCurrent: boolean }) {
  const t = useT();
  const c = data.cards;
  const available = data.compareAvailable;
  const recorded = data.compareRecorded;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title={t("Natijalar")}>
        <p className="text-2xl font-semibold tabular-nums">{formatNumber(c.results.value)}</p>
        <TrendLine value={c.results.value} compare={c.results.compare} unit="count" compareAvailable={available} compareRecorded={recorded} />
      </StatCard>
      <StatCard title={t("Berilganda bo'lardi")}>
        <p className="text-2xl font-semibold tabular-nums">
          {formatPrice(c.amount.value)} {t("so'm")}
        </p>
        <TrendLine value={c.amount.value} compare={c.amount.compare} unit="som" compareAvailable={available} compareRecorded={recorded} />
      </StatCard>
      <StatCard title={t("Lid → to'lov")}>
        <p className="text-2xl font-semibold tabular-nums">{formatPercent(c.leadToPaid.value)}</p>
        {c.leadToPaid.value !== null && c.leadToPaid.compare !== null ? (
          <TrendLine
            value={c.leadToPaid.value}
            compare={c.leadToPaid.compare}
            unit="pct"
            compareAvailable={available}
            compareRecorded={recorded}
          />
        ) : isCurrent ? (
          <p className="text-xs text-muted-foreground">{t("joriy oyda hali to'lamaganlar ham hisobda")}</p>
        ) : null}
      </StatCard>
      {isCurrent && (
        <StatCard title={t("Oy oxiriga taxmin")}>
          <p className="text-2xl font-semibold tabular-nums">
            {c.forecast === null ? "—" : `≈ ${formatNumber(c.forecast)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.forecast === null ? t("hisob boshlangach 3-ish kunidan ko'rinadi") : t("natija, shu sur'at saqlansa")}
          </p>
        </StatCard>
      )}
    </div>
  );
}
