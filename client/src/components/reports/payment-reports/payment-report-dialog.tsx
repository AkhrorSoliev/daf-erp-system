"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  month: string;
  value: number;
}

interface PaymentReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  color: string;
  suffix?: string;
  months: 3 | 6;
  onMonthsChange: (months: 3 | 6) => void;
  trend: TrendPoint[];
}

function fmt(n: number): string {
  return n.toLocaleString("uz-UZ");
}

function compactFmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function PaymentReportDialog({
  open,
  onOpenChange,
  title,
  description,
  color,
  suffix = " so'm",
  months,
  onMonthsChange,
  trend,
}: PaymentReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          <Button
            variant={months === 3 ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onMonthsChange(3)}
          >
            3 oy
          </Button>
          <Button
            variant={months === 6 ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onMonthsChange(6)}
          >
            6 oy
          </Button>
        </div>

        {trend.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Ma&apos;lumotlar mavjud emas
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => compactFmt(Number(v))}
                  />
                  <RechartsTooltip
                    formatter={(value: unknown) => [
                      `${fmt(Number(value))}${suffix}`,
                      title,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 4, fill: color }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div
              className={cn(
                "grid gap-2",
                months === 3 ? "grid-cols-3" : "grid-cols-6",
              )}
            >
              {trend.map((point, i) => {
                const prev = i > 0 ? trend[i - 1].value : point.value;
                const diff = point.value - prev;
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
                    <p className="text-xs font-bold">{compactFmt(point.value)}</p>
                    {i > 0 && (
                      <p
                        className={cn(
                          "text-[10px] font-medium",
                          isUp
                            ? "text-green-600 dark:text-green-400"
                            : isDown
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {isUp ? "+" : ""}
                        {compactFmt(diff)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
