"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface Props {
  startDate: string;
  endDate: string;
}

interface LeadAnalyticsData {
  funnel: { status: string; count: number }[];
  conversionRateOverTime: {
    month: string;
    rate: number;
    total: number;
    converted: number;
  }[];
  averageDaysToConversion: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Yangi",
  CONTACTED: "Bog'lanilgan",
  TRIAL: "Sinov",
  CONVERTED: "O'quvchi bo'lgan",
  LOST: "Yo'qotilgan",
  ARCHIVED: "Arxivlangan",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  CONTACTED: "bg-cyan-500",
  TRIAL: "bg-amber-500",
  CONVERTED: "bg-green-500",
  LOST: "bg-red-500",
  ARCHIVED: "bg-gray-400",
};

// Preferred order for funnel display
const FUNNEL_ORDER = ["NEW", "CONTACTED", "TRIAL", "CONVERTED", "LOST"];

export function ReportsLeadAnalytics({ startDate, endDate }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "lead-analytics", startDate, endDate],
    queryFn: () =>
      api
        .get<LeadAnalyticsData>("/reports/lead-analytics", {
          params: { startDate, endDate },
        })
        .then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  // Sort funnel by preferred order
  const funnelData = FUNNEL_ORDER.map((status) => {
    const item = data.funnel.find((f) => f.status === status);
    return {
      status,
      label: STATUS_LABELS[status] ?? status,
      count: item?.count ?? 0,
      colorClass: STATUS_COLORS[status] ?? "bg-gray-400",
    };
  }).filter((f) => f.count > 0 || f.status !== "LOST");

  const maxCount = Math.max(...funnelData.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        {/* Average days stat */}
        <div className="bg-card rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-muted-foreground text-xs">
            O&apos;rtacha konversiya vaqti
          </p>
          <p className="text-2xl sm:text-3xl font-bold">
            {data.averageDaysToConversion !== null
              ? `${data.averageDaysToConversion} kun`
              : "—"}
          </p>
        </div>

        {/* Total leads by status */}
        <div className="bg-card rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 col-span-2">
          <p className="text-muted-foreground text-xs mb-2">
            Jami lidlar holati
          </p>
          <div className="flex gap-3 sm:gap-4 flex-wrap">
            {data.funnel.map((f) => (
              <div key={f.status} className="text-center">
                <p className="text-base sm:text-lg font-semibold">{f.count}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABELS[f.status] ?? f.status}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-4">Konversiya voronkasi</h3>
        <div className="space-y-3">
          {funnelData.map((f) => (
            <div key={f.status} className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm w-24 sm:w-32 text-right text-muted-foreground shrink-0">
                {f.label}
              </span>
              <div className="flex-1 h-8 bg-muted rounded overflow-hidden relative">
                <div
                  className={`h-full ${f.colorClass} rounded transition-all flex items-center justify-end pr-2`}
                  style={{
                    width: `${Math.max((f.count / maxCount) * 100, 5)}%`,
                  }}
                >
                  <span className="text-white text-xs font-medium">
                    {f.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rate trend */}
      {data.conversionRateOverTime.length > 0 && (
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-medium mb-4">
            Oylik konversiya darajasi
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.conversionRateOverTime}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value, name) => [
                  name === "rate" ? `${value}%` : `${value}`,
                  name === "rate" ? "Konversiya" : `${name}`,
                ]}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
