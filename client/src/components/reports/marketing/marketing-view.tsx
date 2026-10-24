"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { capitalize } from "@/components/reports/departed-students/departed-format";
import { monthLabel } from "@/components/payments/salary-utils";
import { som } from "@/components/payments/overview/overview-math";
import { formatRoi, roiSentence, type MarketingReport } from "./marketing-format";
import { MarketingSources } from "./marketing-sources";

const TRANSITION_NOTE = msg(
  "* May–iyun — tizimga o'tish oylari: eski o'quvchilarning tizimdagi birinchi to'lovi «yangi» ko'rinadi, shuning uchun hisoblanmaydi.",
);

/** The marketing report for one month (spec B1 §3.3). Every figure is the server's; null prints «—». */
export function MarketingReportView({ data }: { data: MarketingReport }) {
  const t = useT();
  return (
    <div className="space-y-6">
      <MarketingSources data={data} />

      <h3 className="font-heading text-base font-semibold">{t("Jami (hamma kanal birga)")}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label={t("Marketingga sarflandi")} value={som(data.spend, t)} sub={t("Xarajatlar → Marketing")} />
        <Card
          label={t("Yangi o'quvchilar")}
          value={`${formatNumber(data.newStudents)}${data.transition ? "*" : ""}`}
          sub={t("birinchi marta to'laganlar")}
        />
        <Card label={t("Jalb qilish narxi")} value={som(data.cac, t)} sub={t("sarf ÷ yangi o'quvchilar")} />
        <Card
          label={t("O'quvchi qiymati")}
          value={som(data.ltv?.value, t)}
          sub={t("o'rtacha {months} oy × oyiga {charge}", {
            months: data.ltv ? formatNumber(data.ltv.avgMonths) : "—",
            charge: som(data.ltv?.monthlyCharge, t),
          })}
        />
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="font-medium">{t("Marketing samarasi")}</p>
        <p className="text-sm">{roiSentence(data, t)}</p>
        {data.roi != null && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("Bu yuqori chegara: hamma yangi o'quvchi ham reklamadan kelmagan. Kanal bo'yicha hisob — tepadagi jadvalda.")}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">{t("Oylar bo'yicha")}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>{t("Oy")}</TableHead>
              <TableHead className="text-right">{t("Sarflandi")}</TableHead>
              <TableHead className="text-right">{t("Yangi o'quvchilar")}</TableHead>
              <TableHead className="text-right">{t("Jalb qilish narxi")}</TableHead>
              <TableHead className="text-right">{t("Hozirgacha to'lagan")}</TableHead>
              <TableHead className="text-right">{t("Samara")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.map((m, i) => (
              <TableRow key={m.month} className={cn(m.transition && "text-muted-foreground")}>
                <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{capitalize(monthLabel(m.month, t))}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.spend, t)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(m.newStudents)}
                  {m.transition ? "*" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cac, t)}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cohortPaid, t)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatRoi(m.roi)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.months.some((m) => m.transition) && <p className="text-xs text-muted-foreground">{t(TRANSITION_NOTE)}</p>}
      </section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
