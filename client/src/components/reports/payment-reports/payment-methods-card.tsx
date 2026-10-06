"use client";

import { Wallet } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
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
        <div className="space-y-2 text-sm tabular-nums">
          {methods.current.map((m) => (
            <MethodRow
              key={m.method}
              label={methodLabel(m.method)}
              meta={`${formatNumber(m.count)} ta · ${m.share}%`}
              amount={m.amount}
            />
          ))}
          <MethodRow
            label="Jami"
            meta={`${formatNumber(methods.total.count)} ta`}
            amount={methods.total.amount}
            total
          />
        </div>
      )}
    </button>
  );
}

/**
 * Bir usul: chapda nomi va «48 ta · 52%», o'ngda summa. Tor kartada izoh
 * nom ostiga tushadi, summa esa hech qachon ikki qatorga bo'linmaydi.
 */
function MethodRow({
  label,
  meta,
  amount,
  total = false,
}: {
  label: string;
  meta: string;
  amount: number;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        total && "border-t pt-2 font-semibold",
      )}
    >
      <div className="min-w-0">
        <span className="mr-2">{label}</span>
        <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">
          {meta}
        </span>
      </div>
      <span className="whitespace-nowrap font-semibold">
        {formatNumber(amount)} so&apos;m
      </span>
    </div>
  );
}
