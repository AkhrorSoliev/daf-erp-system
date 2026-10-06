"use client";

import { Wallet } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import { PAYMENT_METHOD_LABELS } from "@/components/payments/overview/overview-math";

/** `GET /reports/payment-reports` → `methods`. Har son serverniki. */
export interface PaymentMethodsReport {
  current: { method: string; amount: number; count: number; share: number }[];
  total: { amount: number; count: number };
  trend: { month: string; byMethod: Record<string, number> }[];
}

export function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

interface PaymentMethodsCardProps {
  methods: PaymentMethodsReport;
  onClick: () => void;
}

export function PaymentMethodsCard({ methods, onClick }: PaymentMethodsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Wallet className="size-4 shrink-0" />
        <span className="text-sm font-medium">To&apos;lov usullari</span>
      </div>

      {methods.current.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tanlangan davrda to&apos;lov yo&apos;q
        </p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 gap-y-1.5 text-sm tabular-nums">
          {methods.current.map((m) => (
            <MethodRow
              key={m.method}
              label={methodLabel(m.method)}
              amount={m.amount}
              count={m.count}
              share={`${m.share}%`}
            />
          ))}
          <MethodRow
            label="Jami"
            amount={methods.total.amount}
            count={methods.total.count}
            share=""
            total
          />
        </div>
      )}
    </button>
  );
}

function MethodRow({
  label,
  amount,
  count,
  share,
  total = false,
}: {
  label: string;
  amount: number;
  count: number;
  share: string;
  total?: boolean;
}) {
  const line = total ? "border-t pt-1.5 font-semibold" : "";
  return (
    <>
      <span className={line}>{label}</span>
      <span className={`text-right font-semibold ${line}`}>
        {formatNumber(amount)} so&apos;m
      </span>
      <span className={`text-right text-xs text-muted-foreground ${line}`}>
        {formatNumber(count)} ta
      </span>
      <span className={`w-9 text-right text-xs text-muted-foreground ${line}`}>
        {share}
      </span>
    </>
  );
}
