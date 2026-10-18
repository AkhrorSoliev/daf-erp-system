"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { ChartCard } from "@/components/shared/chart-card";
import { formatNumber } from "@/lib/format-utils";
import { monthLabel } from "@/components/payments/salary-utils";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

/** One month of `GET /teachers/:id/stats` (server `TeacherStatsMonth`). */
export interface TeacherStatsMonth {
  month: string;
  salary: number | null;
  activeStudents: number;
  joined: number;
  left: number;
  leftPending: number;
  attendancePct: number | null;
}

interface TeacherStats {
  months: TeacherStatsMonth[];
  salaryVisible: boolean;
}

// Literal colours — SVG does not resolve CSS variables reliably.
const BLUE = "#2563eb";
const GREEN = "#16a34a";
const RED = "#dc2626";
const RED_LIGHT = "#fca5a5";
const GRID = "#e2e8f0";
const TICK = { fontSize: 11, fill: "#64748b" };

// Six labels must fit a half-width card: three letters, as the calendar writes them.
const SHORT_MONTHS = [
  msg("Yan"),
  msg("Fev"),
  msg("Mar"),
  msg("Apr"),
  msg("May"),
  msg("Iyn"),
  msg("Iyl"),
  msg("Avg"),
  msg("Sen"),
  msg("Okt"),
  msg("Noy"),
  msg("Dek"),
];
const shortMonth = (key: string, t: (source: string) => string) => {
  const name = SHORT_MONTHS[Number(key.slice(5, 7)) - 1];
  return name ? t(name) : key;
};

interface TipEntry {
  name?: unknown;
  value?: unknown;
  color?: string;
  payload?: { fullLabel?: string };
}

/** Themed tooltip: shadcn colours, zero rows dropped (CLAUDE.md › Charts). */
function StatsTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: readonly TipEntry[];
  unit: (v: number) => string;
}) {
  const rows = (payload ?? []).filter((e) => typeof e.value === "number" && e.value !== 0);
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{payload[0]?.payload?.fullLabel}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        rows.map((e) => (
          <p key={String(e.name)} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: e.color }} />
            {String(e.name)}: {unit(Math.abs(e.value as number))}
          </p>
        ))
      )}
    </div>
  );
}

const CURSOR = { fill: "rgba(100, 116, 139, 0.12)" };
const pct = (v: number) => `${v}%`;

/** «Ko'rsatkichlar» — the last six months of one teacher. */
export function TeacherStatsCharts({ endpoint }: { endpoint: string }) {
  const t = useT();
  const soM = (v: number) => `${formatNumber(v)} ${t("so'm")}`;
  const nafar = (v: number) => t("{n} nafar", { n: v });
  const millions = (v: number) =>
    v === 0 ? "0" : `${formatNumber(v / 1_000_000, { maximumFractionDigits: 1 })} ${t("mln")}`;
  const { data, isLoading, isError } = useQuery<TeacherStats>({
    queryKey: ["teacher-stats", endpoint],
    queryFn: () => api.get<TeacherStats>(endpoint).then((r) => r.data),
  });

  if (isError) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        {t("Ko'rsatkichlarni yuklab bo'lmadi. Sahifani yangilang.")}
      </p>
    );
  }

  const rows = (data?.months ?? []).map((m) => ({
    ...m,
    label: shortMonth(m.month, t),
    fullLabel: monthLabel(m.month, t),
    // Departures go below the axis.
    leftNeg: -m.left,
    leftPendingNeg: -m.leftPending,
  }));
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const noRows = !isLoading && rows.length === 0;


  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(isLoading || data?.salaryVisible) && (
        <ChartCard
          className="lg:col-span-2"
          title={t("Oylik dinamikasi")}
          subtitle={[
            prev?.salary != null
              ? t("{month}: {amount}", { month: prev.fullLabel, amount: soM(prev.salary) })
              : null,
            last?.salary != null
              ? t("{month} (davom etmoqda): {amount}", { month: last.fullLabel, amount: soM(last.salary) })
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined}
          tooltip={t("Har oy to'liq ishlangan pul — «Ish haqi» bo'limidagi raqamning o'zi.\nJoriy oy hali tugamagan: raqam oy oxirigacha o'sadi.")}
          isLoading={isLoading}
          isEmpty={noRows || rows.every((r) => !r.salary)}
          emptyMessage={t("Bu oylarda oylik yo'q")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={56} tickFormatter={millions} />
              <Tooltip cursor={CURSOR} content={<StatsTooltip unit={soM} />} />
              <Bar dataKey="salary" name={t("Oylik")} fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard
        title={t("Faol o'quvchilar")}
        subtitle={last ? t("Hozir: {n} nafar", { n: last.activeStudents }) : undefined}
        tooltip={t("Har oy oxirida ustoz guruhlarida o'qiyotgan o'quvchilar soni.\nGuruh boshqa ustozga o'tgan oydan boshlab sanalmaydi.")}
        isLoading={isLoading}
        isEmpty={noRows}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<StatsTooltip unit={nafar} />} />
            <Area
              type="monotone"
              dataKey="activeStudents"
              name={t("Faol")}
              stroke={BLUE}
              strokeWidth={2}
              fill={BLUE}
              fillOpacity={0.1}
              dot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title={t("Kelganlar va ketganlar")}
        subtitle={
          last
            ? t("{month}: +{joined} qo'shildi, −{left} ketdi", {
                month: last.fullLabel,
                joined: last.joined,
                left: last.left + last.leftPending,
              })
            : undefined
        }
        tooltip={t("Yashil — ustoz guruhiga qo'shilganlar (boshqa guruhdan o'tganlar ham).\nQizil — markazdan ketganlar («Ketganlar» hisobotidagi qoida).\nOch qizil — to'xtagan, lekin hali qaytishi mumkin (21 kun, muzlatishda 60 kun).")}
        isLoading={isLoading}
        isEmpty={noRows || rows.every((r) => !r.joined && !r.left && !r.leftPending)}
        emptyMessage={t("Bu oylarda kelgan ham, ketgan ham yo'q")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
            <YAxis
              allowDecimals={false}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => String(Math.abs(v))}
            />
            <Tooltip cursor={CURSOR} content={<StatsTooltip unit={nafar} />} />
            <Bar dataKey="joined" name={t("Qo'shildi")} stackId="s" fill={GREEN} maxBarSize={28} />
            <Bar dataKey="leftNeg" name={t("Ketdi")} stackId="s" fill={RED} maxBarSize={28} />
            <Bar dataKey="leftPendingNeg" name={t("Qaytishi mumkin")} stackId="s" fill={RED_LIGHT} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="lg:col-span-2"
        title={t("Davomat")}
        subtitle={
          last?.attendancePct != null
            ? t("{month}: {pct}%", { month: last.fullLabel, pct: last.attendancePct })
            : undefined
        }
        tooltip={t("Kelgan va kechikkanlar ÷ (kelgan + kechikkan + kelmagan).\nSababli va bekor qilingan darslar hisobga olinmaydi.")}
        isLoading={isLoading}
        isEmpty={noRows || rows.every((r) => r.attendancePct == null)}
        emptyMessage={t("Bu oylarda davomat olinmagan")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
            <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip content={<StatsTooltip unit={pct} />} />
            <Line
              type="monotone"
              dataKey="attendancePct"
              name={t("Davomat")}
              stroke={BLUE}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
