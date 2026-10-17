"use client";

import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { DashboardMoney } from "./dashboard-summary-types";

interface MoneyCellProps {
  label: string;
  value: number;
  hint: string;
  tooltip: string;
  href: string;
  valueClassName?: string;
  /** 0–100: a thin bar under the figure (how much of it is collected). */
  progress?: number | null;
}

/**
 * One cell of the ledger strip: a small label, the figure, one line of
 * context. No icon — on a row of four figures an icon per cell is noise,
 * the label already says what the number is.
 */
function MoneyCell({
  label,
  value,
  hint,
  tooltip,
  href,
  valueClassName,
  progress,
}: MoneyCellProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5 transition-colors hover:bg-accent/60 sm:px-5 sm:py-4"
        >
          <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {label}
          </span>
          <span
            className={cn(
              "text-xl leading-tight font-semibold tracking-tight sm:text-2xl",
              valueClassName,
            )}
          >
            {formatNumber(value)}
          </span>
          {typeof progress === "number" && (
            <span
              aria-hidden
              className="mt-0.5 flex h-1 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </span>
          )}
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The month's money as one ledger strip: four figures separated by hairlines,
 * not four cards. Colour appears only where it means something — debt and a
 * loss in `--destructive`, a profit in `--success`.
 */
export function HomeMoneyCards({ money }: { money: DashboardMoney }) {
  const t = useT();
  // Kanonik sof foyda hisoblanmagan bo'lsa raqam kassa asosida keladi va
  // haqiqiy foydadan ancha yuqori chiqadi — karta buni YASHIRMAYDI, o'z
  // sarlavhasini almashtiradi.
  const profitIsCash = money.netProfitBasis === "cash";

  return (
    <section
      aria-label={t("Bu oy pul")}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4"
    >
      <MoneyCell
        label={t("Bu oy tushum")}
        value={money.monthIncome}
        hint={t("{n} ta to'lov", { n: formatNumber(money.paymentCount) })}
        tooltip={t("Shu oy kassaga tushgan pul (so'm).")}
        href="/payments/overview"
      />
      {money.monthCharges ? (
        <MoneyCell
          label={t("Bu oy hisoblandi")}
          value={money.monthCharges.charged}
          hint={
            money.monthCharges.paidPct !== null
              ? t("to'landi {pct}%", { pct: money.monthCharges.paidPct })
              : t("hisob yozilmagan")
          }
          progress={money.monthCharges.paidPct}
          tooltip={t(
            "Shu oy uchun o'quvchilarga yozilgan oylik hisoblar. To'landi — shundan to'langan qismi.",
          )}
          href="/payments/overview"
        />
      ) : (
        <MoneyCell
          label={t("Oy oxiriga kutilyapti")}
          value={money.expectedMonthEnd}
          hint={t("prognoz")}
          tooltip={t(
            "Oy oxirigi prognoz: o'tilgan va rejadagi darslar qiymati. Bu kassa tushumi emas — ikkovi turli o'lchov, shuning uchun ular ayirilmaydi.",
          )}
          href="/payments/overview"
        />
      )}
      {/* Qarz — ikki alohida raqam (ADR-0059): katak birinchisini ko'rsatadi,
          ikkinchisi ost-satrda. Ikkalasi serverdan keladi, qo'shilmaydi. */}
      <MoneyCell
        label={t("O'qiyotganlar qarzi")}
        value={money.debt.studying.total}
        hint={t("{n} ta · o'qimayotganlar {sum}", {
          n: formatNumber(money.debt.studying.count),
          sum: formatPrice(money.debt.notStudying.total),
        })}
        tooltip={t(
          "Faol guruhda o'qiyotganlarning qarzi. O'qimayotganlar (guruhsiz, muzlatilgan, ketgan) qarzi alohida, qo'shilmaydi.",
        )}
        href="/payments/debt"
        valueClassName={
          money.debt.studying.total > 0 ? "text-destructive" : undefined
        }
      />
      <MoneyCell
        label={profitIsCash ? t("Foyda (kassa asosida)") : t("Sof foyda")}
        value={money.netProfit}
        hint={profitIsCash ? t("kassa asosida") : t("shu oy")}
        tooltip={
          profitIsCash
            ? t(
                "Kanonik sof foyda hisoblanmadi, bu kassa asosidagi raqam: ustoz oyligi keyingi davrda to'lanadi, shuning uchun bu son haqiqiy foydadan yuqori chiqadi.",
              )
            : t(
                "Shu oyning sof foydasi: dars tushumidan ustoz va admin oyligi, operatsion xarajat va qaytarishlar ayirilgan.",
              )
        }
        href="/payments/overview"
        valueClassName={money.netProfit < 0 ? "text-destructive" : "text-success"}
      />
    </section>
  );
}
