"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { formatNumber } from "@/lib/format-utils";
import { MonthsToggle } from "./payment-report-dialog";
import { methodLabel, type PaymentMethodsReport } from "./payment-methods-card";

// SVG rangi — literal hex (client/CLAUDE.md, Charts). Uch rang + kulrang.
const METHOD_ORDER = ["CASH", "PAYME", "CLICK", "TRANSFER", "UZUM"];
const METHOD_COLORS: Record<string, string> = {
  CASH: "#f59e0b",
  PAYME: "#06b6d4",
  CLICK: "#8b5cf6",
  TRANSFER: "#94a3b8",
  UZUM: "#cbd5e1",
};
const OTHER_COLOR = "#cbd5e1";

function compactFmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface PaymentMethodsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trend: PaymentMethodsReport["trend"];
  months: 3 | 6;
  onMonthsChange: (months: 3 | 6) => void;
}

export function PaymentMethodsDialog({
  open,
  onOpenChange,
  trend,
  months,
  onMonthsChange,
}: PaymentMethodsDialogProps) {
  const present = new Set(trend.flatMap((p) => Object.keys(p.byMethod)));
  const methods = [
    ...METHOD_ORDER.filter((m) => present.has(m)),
    ...[...present].filter((m) => !METHOD_ORDER.includes(m)),
  ];
  const rows = trend.map((p) => ({ month: p.month, ...p.byMethod }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>To&apos;lov usullari</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Oylar bo&apos;yicha to&apos;lovlar, usullar kesimida
          </p>
        </DialogHeader>

        <MonthsToggle months={months} onMonthsChange={onMonthsChange} />

        {methods.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Bu oylarda to&apos;lov yo&apos;q — davrni kengaytirib ko&apos;ring
            </p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => compactFmt(Number(v))}
                />
                <RechartsTooltip
                  cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
                  content={<MethodsTooltip />}
                />
                <Legend formatter={(value) => methodLabel(String(value))} />
                {methods.map((m) => (
                  <Bar
                    key={m}
                    dataKey={m}
                    stackId="methods"
                    fill={METHOD_COLORS[m] ?? OTHER_COLOR}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

function MethodsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload) return null;
  const entries = payload.filter((e) => Number(e.value) > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, e) => sum + Number(e.value), 0);

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {entries.map((e) => (
        <div key={String(e.dataKey)} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: e.color }}
          />
          <span>{methodLabel(String(e.dataKey))}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">
            {formatNumber(Number(e.value))} so&apos;m
          </span>
        </div>
      ))}
      <div className="mt-1 flex border-t pt-1 font-semibold">
        <span>Jami</span>
        <span className="ml-auto pl-3 tabular-nums">
          {formatNumber(total)} so&apos;m
        </span>
      </div>
    </div>
  );
}
