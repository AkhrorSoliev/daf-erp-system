"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { paymentsListHref } from "@/components/payments/list/payments-url";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { paymentMethodLabel, som } from "./overview-math";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/payments/record-payment-admission";
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
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("{month}da tushgan pul qayerdan keldi", { month: monthShort(month, t) })}</DialogTitle>
          <DialogDescription>{incomeSummary(data, t)}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <IncomeBreakdown month={month} data={data} byMethod={byMethod} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <AllPaymentsButton month={month} />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Yopish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Jami X · N ta to'lov · M o'quvchi»; a count an older server does not send is left out. */
export function incomeSummary(data: IncomeAttribution, t: Translate = interpolate): string {
  return [
    t("Jami {amount}", { amount: som(data.total, t) }),
    ...(data.paymentCount != null ? [t("{n} ta to'lov", { n: formatNumber(data.paymentCount) })] : []),
    t("{n} o'quvchi", { n: formatNumber(data.payerCount) }),
  ].join(" · ");
}

/** The three parts' colours (the dialog's bar and dots, the To'lovlar card's chips). */
export const INCOME_PART_COLOUR = { current: "bg-green-500", advance: "bg-sky-500", late: "bg-amber-500" } as const;

/** The three-colour bar; a part that is 0 is not drawn. */
export function IncomeBar({ parts }: { parts: { key: string; amount: number; colour: string }[] }) {
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-muted">
      {parts.filter((p) => p.amount > 0).map((p) => (
        <div key={p.key} className={p.colour} style={{ flexGrow: p.amount }} />
      ))}
    </div>
  );
}

/**
 * The dialog's body: a bar in three colours, then the parts. A part that is 0
 * is not drawn. The parts are the server's and add up to `total` (ADR-0067).
 */
export function IncomeBreakdown({ month, data, byMethod }: { month: string; data: IncomeAttribution; byMethod: Method[] }) {
  const t = useT();
  const parts = [
    {
      key: "current",
      label: t("{month} oyi to'lovi", { month: monthShort(month, t) }),
      amount: data.currentMonth,
      colour: INCOME_PART_COLOUR.current,
      sub: null as string | null,
    },
    {
      key: "advance",
      label: t("{month} uchun oldindan", { month: monthShort(addMonths(month, 1), t) }),
      amount: data.advance ?? 0,
      colour: INCOME_PART_COLOUR.advance,
      sub:
        data.advanceStudents != null
          ? t("{n} o'quvchining balansida turibdi", { n: formatNumber(data.advanceStudents) })
          : null,
    },
    {
      key: "late",
      label: t("Eski qarzlar uchun"),
      amount: data.lateTotal,
      colour: INCOME_PART_COLOUR.late,
      sub:
        data.latePaymentCount != null && data.lateStudentCount != null
          ? t("{payments} ta to'lov, {students} o'quvchi", {
              payments: formatNumber(data.latePaymentCount),
              students: formatNumber(data.lateStudentCount),
            })
          : null,
    },
  ].filter((p) => p.amount > 0);

  return (
    <div className="space-y-4">
      <IncomeBar parts={parts} />
      <ul className="space-y-3">
        {parts.map((p) => (
          <li key={p.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2.5 shrink-0 rounded-full ${p.colour}`} />
                {p.label}
              </span>
              <span className="font-semibold tabular-nums">{som(p.amount, t)}</span>
            </div>
            {p.sub && <p className="pl-5 text-xs text-muted-foreground">{p.sub}</p>}
            {p.key === "late" && (
              <ul className="space-y-0.5 pl-5 text-xs">
                {data.late.map((m) => (
                  <li key={m.monthKey} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("{label} qarzi", { label: m.label })}</span>
                    <span className="tabular-nums">{som(m.amount, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {byMethod.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("Qanday to'landi")}</p>
          <div className="flex flex-wrap gap-2">
            {byMethod.map((m) => (
              <span key={m.method} className="rounded-full border px-3 py-1 text-xs">
                {paymentMethodLabel(m.method, t)} · {som(m.amount, t)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The footer's «Barcha to'lovlar»: the month's payments list. */
export function AllPaymentsButton({ month }: { month: string }) {
  const t = useT();
  return (
    <Button asChild variant="outline">
      <Link href={paymentsListHref(month, tashkentNow().dateStr.slice(0, 7))}>{t("Barcha to'lovlar")}</Link>
    </Button>
  );
}
