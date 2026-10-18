import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { som } from "@/components/payments/overview/overview-math";
import { formatRoi, type MarketingReport, type SourceRow } from "./marketing-format";

const NUM = "text-right tabular-nums";

function Figures({ row }: { row: Omit<SourceRow, "source"> }) {
  return (
    <>
      <TableCell className={NUM}>{row.spend > 0 ? som(row.spend) : "—"}</TableCell>
      <TableCell className={NUM}>{formatNumber(row.leads)}</TableCell>
      <TableCell className={NUM}>{formatNumber(row.students)}</TableCell>
      <TableCell className={NUM}>{som(row.cac)}</TableCell>
      <TableCell className={NUM}>{som(row.paid)}</TableCell>
      <TableCell className={NUM}>{formatRoi(row.roi)}</TableCell>
      <TableCell className={NUM}>{row.leads > 0 ? formatPercent(row.rate) : "—"}</TableCell>
    </>
  );
}

/**
 * «Kanallar bo'yicha» (ADR-0109): per lead source of the month — what it cost, who came,
 * who paid, what one paying student cost and what they have paid. «Hammasi» is the whole month.
 */
export function MarketingSources({ data }: { data: MarketingReport }) {
  const { sources, sourcesTotal, unassignedSpend } = data;
  return (
    <section className="space-y-2">
      <h3 className="font-heading text-base font-semibold">Kanallar bo&apos;yicha</h3>
      {sources && sourcesTotal && (
        <>
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead className="text-right">Sarflandi</TableHead>
                <TableHead className="text-right">Lid</TableHead>
                <TableHead className="text-right">O&apos;quvchi bo&apos;ldi</TableHead>
                <TableHead className="text-right">1 o&apos;quvchi narxi</TableHead>
                <TableHead className="text-right">Hozirgacha to&apos;lagan</TableHead>
                <TableHead className="text-right">Samara</TableHead>
                <TableHead className="text-right">Aylanish</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s, i) => (
                <TableRow key={s.source ?? "none"}>
                  <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{s.source ?? "Manba yozilmagan"}</TableCell>
                  <Figures row={s} />
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell className="border-r" />
                <TableCell>Hammasi</TableCell>
                <Figures row={sourcesTotal} />
              </TableRow>
            </TableBody>
          </Table>
          {unassignedSpend != null && unassignedSpend > 0 && (
            <p className="text-xs text-muted-foreground">
              Kanali ko&apos;rsatilmagan sarf: {som(unassignedSpend)} — «Hammasi» qatorida bor, kanallar qatorida yo&apos;q.
              Xarajat yozilganda kanalni tanlang.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Shu oyda lid bo&apos;lib yozilganlar sanaladi; ular keyinroq to&apos;lasa, raqamlar o&apos;sadi. Shuning uchun
            «O&apos;quvchi bo&apos;ldi» tepadagi «Yangi o&apos;quvchilar»dan farq qilishi mumkin.
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">Lid manbasi 10.09.2026 dan beri yoziladi.</p>
    </section>
  );
}
