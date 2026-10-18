"use client";

import { BadgeCheck, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale, useT } from "@/i18n/context";
import { formatBalance } from "@/lib/format-utils";
import { markedText } from "../debt-history/marked-text";
import { keepsMonthCapital } from "../expenses/expenses-format";
import { monthShort } from "../salary-utils";
import { centerLine, monthStatePill, netLabel, summaryNumbers } from "./salary-page-model";
import { SalaryToneBadge } from "./salary-tone-badge";
import type { MonthlyResponse } from "./salary-types";

interface Props {
  data: MonthlyResponse;
  /** `salary.close` — the bulk settle. */
  canClose: boolean;
  /** Unpaid payroll rows of the month, from the settle preview. */
  unpaidCount: number;
  onSettle: () => void;
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/**
 * «{Oy} oyliklari» (spec §2.2): the month state and three figures, all the
 * server's. The figures are whole so'm, never rounded to millions.
 */
export function SalarySummaryCard({ data, canClose, unpaidCount, onSettle }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const som = (amount: number) => formatBalance(amount, t("so'm"));
  const s = summaryNumbers(data);
  const pill = monthStatePill(data.monthState, data.month, t);
  const net = netLabel(data.monthState, t);
  const center = centerLine(data, t, !keepsMonthCapital(locale));
  const teachers = s.teachersWorked == null ? "—" : som(s.teachersWorked);
  const showSettle = canClose && unpaidCount > 0 && data.monthState.kind !== "OPEN";

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle className="text-base">{t("{month} oyliklari", { month: monthShort(data.month, t) })}</CardTitle>
        <SalaryToneBadge tone={pill.tone} className="h-auto whitespace-normal">
          {pill.text}
        </SalaryToneBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <Figure
              label={t("Ishladi")}
              value={s.worked == null ? "—" : som(s.worked)}
              sub={t("ustozlar {teachers} · xodimlar {staff}", { teachers, staff: som(s.staffWorked) })}
            />
            {s.teachersWorked == null && <p className="text-xs text-amber-600">{t("o'tish oyi")}</p>}
          </div>
          <Figure
            label={t("Avans (oylikdan ushlanadi)")}
            value={som(s.advances)}
            sub={t("{n} ta", { n: s.advanceCount })}
          />
          <Figure
            label={net.label}
            value={som(s.net)}
            sub={net.sub ?? t("{teachers} ustoz · {staff} xodim", { teachers: s.teacherCount, staff: s.staffCount })}
          />
        </div>
        {center && (
          <p className="text-sm">
            {markedText(t("shundan **markaz qo'shdi — {amount}**", { amount: som(center.amount) }))}{" "}
            <span className="text-muted-foreground">{center.note}</span>
          </p>
        )}
        {showSettle && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t(
                "Hammasi bir kunda berilgan bo'lsa — bir yo'la belgilash. Sana va har filial kassa/karta summalari so'raladi.",
              )}
            </p>
            <Button variant="outline" className="shrink-0" onClick={onSettle}>
              <BadgeCheck data-icon="inline-start" />
              {t("Oylik berilganini tasdiqlash ({n} ta)", { n: unpaidCount })}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2 text-xs text-muted-foreground">
        <CircleCheck className="size-4 shrink-0 text-green-600" />
        {t("Umumiy ma'lumotlardagi «Oyliklar» kartasi va ustozning «Mening oyligim» sahifasi — shu raqamlar")}
      </CardFooter>
    </Card>
  );
}
