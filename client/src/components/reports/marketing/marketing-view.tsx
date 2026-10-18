"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/components/payments/salary-utils";
import { som } from "@/components/payments/overview/overview-math";
import { formatRoi, roiSentence, type MarketingReport } from "./marketing-format";
import { MarketingSources } from "./marketing-sources";

const TRANSITION_NOTE =
  "* May–iyun — tizimga o'tish oylari: eski o'quvchilarning tizimdagi birinchi to'lovi «yangi» ko'rinadi, shuning uchun hisoblanmaydi.";

/** The marketing report for one month (spec B1 §3.3). Every figure is the server's; null prints «—». */
export function MarketingReportView({ data }: { data: MarketingReport }) {
  return (
    <div className="space-y-6">
      <MarketingSources data={data} />

      <h3 className="font-heading text-base font-semibold">Jami (hamma kanal birga)</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Marketingga sarflandi" value={som(data.spend)} sub="Xarajatlar → Marketing" />
        <Card
          label="Yangi o'quvchilar"
          value={`${formatNumber(data.newStudents)}${data.transition ? "*" : ""}`}
          sub="birinchi marta to'laganlar"
        />
        <Card label="Jalb qilish narxi" value={som(data.cac)} sub="sarf ÷ yangi o'quvchilar" />
        <Card
          label="O'quvchi qiymati"
          value={som(data.ltv?.value)}
          sub={`o'rtacha ${data.ltv ? formatNumber(data.ltv.avgMonths) : "—"} oy × oyiga ${som(data.ltv?.monthlyCharge)}`}
        />
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="font-medium">Marketing samarasi</p>
        <p className="text-sm">{roiSentence(data)}</p>
        {data.roi != null && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Bu yuqori chegara: hamma yangi o&apos;quvchi ham reklamadan kelmagan. Kanal bo&apos;yicha hisob —
            tepadagi jadvalda.
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Oylar bo&apos;yicha</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Sarflandi</TableHead>
              <TableHead className="text-right">Yangi o&apos;quvchi</TableHead>
              <TableHead className="text-right">Jalb qilish narxi</TableHead>
              <TableHead className="text-right">Hozirgacha to&apos;lagan</TableHead>
              <TableHead className="text-right">Samara</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.map((m, i) => (
              <TableRow key={m.month} className={cn(m.transition && "text-muted-foreground")}>
                <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{monthLabel(m.month)}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(m.newStudents)}
                  {m.transition ? "*" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cac)}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cohortPaid)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatRoi(m.roi)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.months.some((m) => m.transition) && <p className="text-xs text-muted-foreground">{TRANSITION_NOTE}</p>}
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
