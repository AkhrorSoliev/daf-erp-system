"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IncomeAttributionPanel } from "./income-attribution-panel";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface TrendPoint {
  month: string;
  income: number;
  expenses: number;
  profit: number;
  activeBalance: number;
  ltv: number;
  cac: number;
  marketingRoi: number;
  avgPayment: number;
}

export type KpiKey =
  | "income"
  | "expenses"
  | "profit"
  | "activeBalance"
  | "ltv"
  | "cac"
  | "marketingRoi"
  | "avgPayment";

const kpiConfig: Record<
  KpiKey,
  { title: string; color: string; suffix: string; description: string }
> = {
  income: {
    title: "Tushumlar",
    color: "#16a34a",
    suffix: " so'm",
    description: "Oxirgi 6 oyda kassaga qancha pul kirgani",
  },
  expenses: {
    title: "Chiqimlar dinamikasi",
    color: "#dc2626",
    suffix: " so'm",
    description:
      "Oxirgi 6 oyda pul qayerga ketgani — xarajatlar va ustoz oyliklari birgalikda. Yuqoridagi karta esa faqat xarajatlarni ko'rsatadi, oyliksiz.",
  },
  profit: {
    // Same canonical basis as the Foyda card: recognised revenue minus deserved
    // salary, expenses and refunds. The per-month figure is day-cached server
    // side, so plotting six months costs one computation per day rather than
    // ten times the queries on every open.
    title: "Sof foyda",
    color: "#2563eb",
    suffix: " so'm",
    description:
      "Oxirgi 6 oydagi sof foyda — kartadagi raqam bilan bir xil. Kuniga bir marta yangilanadi.",
  },
  activeBalance: {
    title: "Aktiv balans",
    color: "#7c3aed",
    suffix: " so'm",
    description:
      "Faol o'quvchilar hisobidagi jami pul. Musbat bo'lsa — oldindan to'langan, manfiy bo'lsa — qarz.",
  },
  ltv: {
    title: "LTV — O'quvchi qiymati",
    color: "#8b5cf6",
    suffix: " so'm",
    description:
      "Bitta o'quvchi o'rtacha qancha pul olib keladi. Yuqori bo'lsa — o'quvchilar uzoq qoladi va ko'proq to'laydi.",
  },
  cac: {
    title: "CAC — Jalb qilish narxi",
    color: "#d97706",
    suffix: " so'm",
    description:
      "Bitta yangi o'quvchi olib kelish uchun o'rtacha qancha sarflangani. Past bo'lsa — marketing samarali.",
  },
  marketingRoi: {
    title: "Marketing ROI",
    color: "#059669",
    suffix: "%",
    description:
      "Marketingga sarflangan pul qancha qaytgani. 100% dan yuqori bo'lsa — foyda keltiryapti.",
  },
  avgPayment: {
    title: "O'rtacha to'lov",
    color: "#0284c7",
    suffix: " so'm",
    description: "Bitta to'lov o'rtacha qancha bo'lgani",
  },
};

function fmt(n: number) {
  return n.toLocaleString("uz-UZ");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiKey: KpiKey | null;
  /** Selected period (yyyy-MM-dd) — drives the income composition drill-down. */
  startDate?: string;
  endDate?: string;
  /**
   * «Oy oxiriga kutilyapti» for the period's month. The income drill-down
   * measures collection against it, so it is threaded from the overview
   * rather than fetched again — same request, same figure, no second answer.
   */
  expectedMonthEnd?: number;
}

export function KpiChartDialog({
  open,
  onOpenChange,
  kpiKey,
  startDate,
  endDate,
  expectedMonthEnd,
}: Props) {
  const { selectedBranch } = useBranchSwitcher();

  const { data: trend, isLoading } = useQuery({
    queryKey: ["financial-trend", selectedBranch?.id],
    queryFn: () =>
      api
        .get<TrendPoint[]>("/reports/financial-trend", {
          params: { branchId: selectedBranch?.id },
        })
        .then((r) => r.data),
    enabled: open,
  });

  if (!kpiKey) return null;

  const config = kpiConfig[kpiKey];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !trend?.length ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Ma&apos;lumotlar mavjud emas
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient
                      id={`grad-${kpiKey}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={config.color}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={config.color}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000
                          ? `${(v / 1_000).toFixed(0)}K`
                          : String(v)
                    }
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 13,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value: unknown) => [
                      `${fmt(Number(value))}${config.suffix}`,
                      config.title,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={kpiKey}
                    stroke={config.color}
                    strokeWidth={2.5}
                    fill={`url(#grad-${kpiKey})`}
                    dot={{ r: 4, fill: config.color, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly values table */}
            <div className="grid grid-cols-6 gap-2">
              {trend.map((point, i) => {
                const val = point[kpiKey];
                const prev = i > 0 ? trend[i - 1][kpiKey] : val;
                const diff = val - prev;
                const isUp = diff > 0;
                const isDown = diff < 0;

                return (
                  <div
                    key={point.month}
                    className="rounded-lg border p-2 text-center space-y-0.5"
                  >
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {point.month}
                    </p>
                    <p className="text-xs font-bold">
                      {fmt(val)}
                      {config.suffix === "%" ? "%" : ""}
                    </p>
                    {i > 0 && (
                      <p
                        className={`text-[10px] font-medium ${isUp ? "text-green-600" : isDown ? "text-red-600" : "text-muted-foreground"}`}
                      >
                        {isUp ? "+" : ""}
                        {config.suffix === "%"
                          ? `${diff}%`
                          : diff >= 1_000_000
                            ? `${(diff / 1_000_000).toFixed(1)}M`
                            : diff >= 1_000 || diff <= -1_000
                              ? `${(diff / 1_000).toFixed(0)}K`
                              : fmt(diff)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Income-only drill-down: real (this month) vs late (prior months). */}
        {kpiKey === "income" && startDate && endDate && (
          <IncomeAttributionPanel
            startDate={startDate}
            endDate={endDate}
            expectedMonthEnd={expectedMonthEnd}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
