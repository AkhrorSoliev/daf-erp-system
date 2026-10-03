"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format-utils";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { PAYMENT_METHOD_LABELS, som } from "./overview-math";
import type { IncomeAttribution } from "./types";

type Method = { method: string; amount: number; count: number };

/** «Qayerdan keldi» (spec B1 §2.4): the month's cash in its three parts and the methods it came by. */
export function IncomeDialog({
  open,
  onOpenChange,
  month,
  data,
  byMethod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  data: IncomeAttribution;
  byMethod: Method[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{monthShort(month)}da tushgan pul qayerdan keldi</DialogTitle>
          <DialogDescription>{incomeSummary(data)}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <IncomeBreakdown month={month} data={data} byMethod={byMethod} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Jami X · N ta to'lov · M o'quvchi»; a count an older server does not send is left out. */
export function incomeSummary(data: IncomeAttribution): string {
  return [
    `Jami ${som(data.total)}`,
    ...(data.paymentCount != null ? [`${formatNumber(data.paymentCount)} ta to'lov`] : []),
    `${formatNumber(data.payerCount)} o'quvchi`,
  ].join(" · ");
}

/**
 * The dialog's body: a bar in three colours, then the parts. A part that is 0
 * is not drawn. The parts are the server's and add up to `total` (ADR-0067).
 */
export function IncomeBreakdown({ month, data, byMethod }: { month: string; data: IncomeAttribution; byMethod: Method[] }) {
  const parts = [
    {
      key: "current",
      label: `${monthShort(month)} oyi to'lovi`,
      amount: data.currentMonth,
      colour: "bg-green-500",
      sub: null as string | null,
    },
    {
      key: "advance",
      label: `${monthShort(addMonths(month, 1))} uchun oldindan`,
      amount: data.advance ?? 0,
      colour: "bg-sky-500",
      sub: data.advanceStudents != null ? `${formatNumber(data.advanceStudents)} o'quvchining balansida turibdi` : null,
    },
    {
      key: "late",
      label: "Eski qarzlar uchun",
      amount: data.lateTotal,
      colour: "bg-amber-500",
      sub:
        data.latePaymentCount != null && data.lateStudentCount != null
          ? `${formatNumber(data.latePaymentCount)} ta to'lov, ${formatNumber(data.lateStudentCount)} o'quvchi`
          : null,
    },
  ].filter((p) => p.amount > 0);

  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div key={p.key} className={p.colour} style={{ flexGrow: p.amount }} />
        ))}
      </div>
      <ul className="space-y-3">
        {parts.map((p) => (
          <li key={p.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2.5 shrink-0 rounded-full ${p.colour}`} />
                {p.label}
              </span>
              <span className="font-semibold tabular-nums">{som(p.amount)}</span>
            </div>
            {p.sub && <p className="pl-5 text-xs text-muted-foreground">{p.sub}</p>}
            {p.key === "late" && (
              <ul className="space-y-0.5 pl-5 text-xs">
                {data.late.map((m) => (
                  <li key={m.monthKey} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{m.label} qarzi</span>
                    <span className="tabular-nums">{som(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {byMethod.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Qanday to&apos;landi</p>
          <div className="flex flex-wrap gap-2">
            {byMethod.map((m) => (
              <span key={m.method} className="rounded-full border px-3 py-1 text-xs">
                {PAYMENT_METHOD_LABELS[m.method] ?? m.method} · {som(m.amount)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
