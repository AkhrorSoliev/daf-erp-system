import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { ageText, pctText } from "./audience-format";
import type { AudienceCutRow } from "./audience-types";

/**
 * Blocks 4 and 5: the same figures per course or branch. Not paginated on
 * purpose: it is a whole-picture summary (a handful of rows), like the months
 * table of the departed report. A dash means the server had too few known.
 * `title` and `nameHead` are `msg()` texts, translated here. Row names are the server's.
 */
export function AudienceCutTable({ title, nameHead, rows }: { title: string; nameHead: string; rows: AudienceCutRow[] }) {
  const t = useT();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t(title)}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>{t(nameHead)}</TableHead>
              <TableHead className="text-right">{t("O'quvchilar")}</TableHead>
              <TableHead className="text-right">{t("Jinsi aniq")}</TableHead>
              <TableHead className="text-right">{t("Erkaklar")}</TableHead>
              <TableHead className="text-right">{t("Ayollar")}</TableHead>
              <TableHead className="text-right">{t("O'rtacha yosh")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.genderKnown)}</TableCell>
                {r.malePct === null ? (
                  <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                    {t("yetarli ma'lumot yo'q")}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">{pctText(r.malePct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pctText(r.femalePct)}</TableCell>
                  </>
                )}
                <TableCell className="text-right tabular-nums">{ageText(r.avgAge)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {t("Jinsi yoki yoshi aniq o'quvchi 5 tadan kam bo'lsa, foiz ko'rsatilmaydi.")}
        </p>
      </CardContent>
    </Card>
  );
}
