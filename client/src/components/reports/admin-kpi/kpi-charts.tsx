"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { monthLabel, monthShort } from "@/components/payments/salary-utils";
import { capitalize } from "@/components/reports/departed-students/departed-format";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { axisSom } from "./kpi-format";
import type { KpiOverview, KpiUserView } from "./kpi-types";

// Literal colours: SVG attributes ignore CSS variables (client/CLAUDE.md, charts).
const CURRENT = "#2563eb"; // blue-600
const COMPARE = "#94a3b8"; // slate-400
const LEAD = "#f59e0b"; // amber-500
const PROMISE = "#8b5cf6"; // violet-500
const GRID = "#e2e8f0";
const TICK = { fontSize: 11, fill: "#64748b" };

// Recharts injects its own loosely typed payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TooltipProps = { active?: boolean; payload?: ReadonlyArray<any> };

type LegendItem = { label: string; color: string; dashed?: boolean };

/** Colour key above a chart (HTML, so it follows the theme and renders in tests). */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-4 shrink-0"
            style={{ borderTop: `2px ${i.dashed ? "dashed" : "solid"} ${i.color}` }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** The daily chart's key: the month, and the compare month only when it has data. */
export function dailyLegend(
  month: string,
  compare: string,
  compareAvailable: boolean,
  t: (source: string) => string = (source) => source,
): LegendItem[] {
  return [
    { label: capitalize(monthLabel(month, t)), color: CURRENT },
    ...(compareAvailable ? [{ label: capitalize(monthLabel(compare, t)), color: COMPARE, dashed: true }] : []),
  ];
}

/** Labels are `msg()` texts, translated where drawn. */
const MONTHS_LEGEND: LegendItem[] = [
  { label: msg("Lid to'lov qildi"), color: LEAD },
  { label: msg("Va'da bajarildi"), color: PROMISE },
];

const TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** Rounded top corners for the segment that is on top of the stack: lead-only months end in the lead bar. */
export function topRadius(row: { promiseKept: number }, part: "lead" | "promise"): [number, number, number, number] | 0 {
  return part === "promise" || row.promiseKept === 0 ? TOP_RADIUS : 0;
}

// Recharts hands the shape its own loosely typed props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShapeProps = any;
function LeadShape(p: ShapeProps) {
  return <Rectangle {...p} radius={topRadius(p.payload ?? p, "lead")} />;
}
function PromiseShape(p: ShapeProps) {
  return <Rectangle {...p} radius={topRadius(p.payload ?? p, "promise")} />;
}

/**
 * «Oy davomida»: cumulative results by day of month, the month and the compare month (spec §7.7).
 * `compareAvailable` false (the compare month is before 2026-10, so its figures are an empty 0)
 * draws the month alone: no compare line, legend or tooltip row.
 */
export function KpiDailyChart({
  data,
  month,
  compare,
  compareAvailable,
}: {
  data: KpiOverview["daily"];
  month: string;
  compare: string;
  compareAvailable: boolean;
}) {
  const t = useT();
  const isEmpty = data.every((d) => !d.current && !(compareAvailable && d.compare));
  return (
    <ChartCard
      title={t("Oy davomida")}
      subtitle={
        compareAvailable
          ? t("{month} va {compare} — yig'ma natijalar soni, oy kuni bo'yicha", {
              month: capitalize(monthLabel(month, t)),
              compare: monthLabel(compare, t),
            })
          : t("{month} — yig'ma natijalar soni, oy kuni bo'yicha", { month: capitalize(monthLabel(month, t)) })
      }
      isEmpty={isEmpty}
      emptyMessage={
        compareAvailable
          ? t("Ikki oyda ham natija yo'q — boshqa oyni tanlab ko'ring")
          : t("Bu oyda natija yo'q — boshqa oyni tanlab ko'ring")
      }
      bodyHeightClass="h-[260px]"
    >
      <div className="flex h-full flex-col">
        <ChartLegend items={dailyLegend(month, compare, compareAvailable, t)} />
        <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="day" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            content={(p) => <DailyTooltip {...p} month={month} compare={compare} compareAvailable={compareAvailable} />}
          />
          {compareAvailable && (
            <Line type="monotone" dataKey="compare" stroke={COMPARE} strokeDasharray="4 4" dot={false} />
          )}
          <Line type="monotone" dataKey="current" stroke={CURRENT} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/** A day of the cumulative lines. A missing figure (null: a day not yet come) has no row; a real 0 does. */
export function DailyTooltip({
  active,
  payload,
  month,
  compare,
  compareAvailable,
}: TooltipProps & { month: string; compare: string; compareAvailable: boolean }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { day: number; current: number | null; compare: number | null };
  const lines = [
    { label: capitalize(monthLabel(month, t)), value: row.current, color: CURRENT },
    ...(compareAvailable ? [{ label: capitalize(monthLabel(compare, t)), value: row.compare, color: COMPARE }] : []),
  ].filter((l) => l.value !== null);
  return (
    <div className="min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{t("{day}-kun", { day: row.day })}</div>
      {lines.map((l) => (
        <div key={l.label} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
          <span className="flex-1">{l.label}</span>
          <span className="font-semibold tabular-nums">{formatNumber(l.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

/** «Oylar bo'yicha»: the last six months from 2026-10, lead and promise parts stacked (spec §7.7). */
export function KpiMonthsChart({ data }: { data: KpiOverview["months"] }) {
  const t = useT();
  const rows = data.map((m) => ({ ...m, label: monthShort(m.month, t), _total: m.leadPaid + m.promiseKept }));
  return (
    <ChartCard
      title={t("Oylar bo'yicha")}
      subtitle={t("Natijalar soni: lid va va'da qismlari")}
      isEmpty={rows.every((r) => r._total === 0)}
      emptyMessage={t("Hali natija yo'q — birinchi to'lovdan keyin chiqadi")}
      bodyHeightClass="h-[260px]"
    >
      <div className="flex h-full flex-col">
        <ChartLegend items={MONTHS_LEGEND.map((i) => ({ ...i, label: t(i.label) }))} />
        <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
          <Tooltip cursor={{ fill: "rgba(100, 116, 139, 0.12)" }} content={(p) => <MonthsTooltip {...p} />} />
          <Bar dataKey="leadPaid" stackId="k" fill={LEAD} shape={LeadShape} />
          <Bar dataKey="promiseKept" stackId="k" fill={PROMISE} shape={PromiseShape}>
            <LabelList
              dataKey="_total"
              position="top"
              style={{ fill: "#64748b", fontSize: 11 }}
              formatter={(v: unknown) => (typeof v === "number" && v > 0 ? String(v) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/** A month's stack: the parts that have data, then the total. */
export function MonthsTooltip({ active, payload }: TooltipProps) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as KpiOverview["months"][number];
  return (
    <div className="min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{capitalize(monthLabel(row.month, t))}</div>
      {[
        { label: t("Lid to'lov qildi"), value: row.leadPaid, color: LEAD },
        { label: t("Va'da bajarildi"), value: row.promiseKept, color: PROMISE },
      ]
        .filter((l) => l.value > 0)
        .map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="flex-1">{l.label}</span>
            <span className="font-semibold tabular-nums">{formatNumber(l.value)}</span>
          </div>
        ))}
      <div className="mt-1 flex justify-between gap-2 border-t pt-1">
        <span>{t("Jami")}</span>
        <span className="font-semibold tabular-nums">
          {formatNumber(row.leadPaid + row.promiseKept)} · {formatPrice(row.amount)} {t("so'm")}
        </span>
      </div>
    </div>
  );
}

/** One person's last months (spec §7.8): the sum each month would have paid. */
export function KpiUserMonthsChart({ data }: { data: KpiUserView["months"] }) {
  const t = useT();
  const rows = data.map((m) => ({ ...m, label: monthShort(m.month, t) }));
  return (
    <ChartCard
      title={t("Oxirgi oylar")}
      subtitle={t("Har oy berilganda bo'ladigan summa")}
      isEmpty={rows.every((r) => r.amount === 0)}
      emptyMessage={t("Hali natija yo'q — birinchi to'lovdan keyin chiqadi")}
      bodyHeightClass="h-[180px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => axisSom(v, t)} />
          <Tooltip content={(p) => <UserMonthsTooltip {...p} />} />
          <Line type="monotone" dataKey="amount" stroke={CURRENT} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function UserMonthsTooltip({ active, payload }: TooltipProps) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as KpiUserView["months"][number];
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{capitalize(monthLabel(row.month, t))}</div>
      <div className="tabular-nums">
        {t("{n} ta natija", { n: formatNumber(row.count) })} · {formatPrice(row.amount)} {t("so'm")}
      </div>
    </div>
  );
}
