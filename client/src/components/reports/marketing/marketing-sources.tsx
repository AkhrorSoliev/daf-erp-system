import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { som } from "@/components/payments/overview/overview-math";
import { formatRoi, type MarketingReport, type SourceRow } from "./marketing-format";

const NUM = "text-right tabular-nums";

function Figures({ row }: { row: Omit<SourceRow, "source"> }) {
  const t = useT();
  return (
    <>
      <TableCell className={NUM}>{row.spend > 0 ? som(row.spend, t) : "—"}</TableCell>
      <TableCell className={NUM}>{formatNumber(row.leads)}</TableCell>
      <TableCell className={NUM}>{formatNumber(row.students)}</TableCell>
      <TableCell className={NUM}>{som(row.cac, t)}</TableCell>
      <TableCell className={NUM}>{som(row.paid, t)}</TableCell>
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
  const t = useT();
  const { sources, sourcesTotal, unassignedSpend } = data;
  return (
    <section className="space-y-2">
      <h3 className="font-heading text-base font-semibold">{t("Kanallar bo'yicha")}</h3>
      {sources && sourcesTotal && (
        <>
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>{t("Kanal")}</TableHead>
                <TableHead className="text-right">{t("Sarflandi")}</TableHead>
                <TableHead className="text-right">{t("Lidlar")}</TableHead>
                <TableHead className="text-right">{t("O'quvchi bo'ldi")}</TableHead>
                <TableHead className="text-right">{t("1 o'quvchi narxi")}</TableHead>
                <TableHead className="text-right">{t("Hozirgacha to'lagan")}</TableHead>
                <TableHead className="text-right">{t("Samara")}</TableHead>
                <TableHead className="text-right">{t("Aylanish")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s, i) => (
                <TableRow key={s.source ?? "none"}>
                  <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{s.source ?? t("Manba yozilmagan")}</TableCell>
                  <Figures row={s} />
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell className="border-r" />
                <TableCell>{t("Hammasi")}</TableCell>
                <Figures row={sourcesTotal} />
              </TableRow>
            </TableBody>
          </Table>
          {unassignedSpend != null && unassignedSpend > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("Kanali ko'rsatilmagan sarf: {sum} — «Hammasi» qatorida bor, kanallar qatorida yo'q. Xarajat yozilganda kanalni tanlang.", { sum: som(unassignedSpend, t) })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Shu oyda lid bo'lib yozilganlar sanaladi; ular keyinroq to'lasa, raqamlar o'sadi. Shuning uchun «O'quvchi bo'ldi» tepadagi «Yangi o'quvchilar»dan farq qilishi mumkin.")}
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("Lid manbasi 10.09.2026 dan beri yoziladi.")}</p>
    </section>
  );
}
