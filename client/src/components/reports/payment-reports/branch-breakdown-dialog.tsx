"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

interface BranchRow {
  branchId: number;
  branchName: string;
  amount: number;
}

interface BranchBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  byBranch: BranchRow[];
  trend: { month: string; value: number }[];
  months: 3 | 6;
  onMonthsChange: (months: 3 | 6) => void;
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

export function BranchBreakdownDialog({
  open,
  onOpenChange,
  byBranch,
  trend,
  months,
  onMonthsChange,
}: BranchBreakdownDialogProps) {
  const totalAmount = byBranch.reduce((sum, b) => sum + b.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Filiallar bo&apos;yicha jami to&apos;lovlar</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Joriy oydagi filiallar bo&apos;yicha to&apos;lovlar taqsimoti
          </p>
        </DialogHeader>

        {byBranch.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Ma&apos;lumotlar mavjud emas
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBranch}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="branchName" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => compactFmt(Number(v))}
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
                      `${fmt(Number(value))} so'm`,
                      "Summa",
                    ]}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border divide-y">
              {byBranch.map((b) => {
                const percent =
                  totalAmount > 0
                    ? Math.round((b.amount / totalAmount) * 100)
                    : 0;
                return (
                  <div
                    key={b.branchId}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">{b.branchName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {percent}%
                      </span>
                      <span className="font-semibold tabular-nums">
                        {fmt(b.amount)} so&apos;m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Oylik dinamika</p>
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
              </div>
              <div
                className={cn(
                  "grid gap-2",
                  months === 3 ? "grid-cols-3" : "grid-cols-6",
                )}
              >
                {trend.map((point) => (
                  <div
                    key={point.month}
                    className="rounded-lg border p-2 text-center"
                  >
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {point.month}
                    </p>
                    <p className="text-xs font-bold">
                      {compactFmt(point.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
