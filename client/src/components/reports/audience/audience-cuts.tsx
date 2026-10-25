import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { shareText, unknownCount } from "./audience-format";
import type { AudienceCutRow } from "./audience-types";

/**
 * Blocks 2 and 3: the studying students per level or per course, with how many
 * of them have a known gender. Counts only, so a row is true however little is
 * known; the last column says how complete it is. Not paginated on purpose: a
 * handful of rows, a whole-picture summary. `title` and `nameHead` are `msg()`
 * texts, translated here. Row names are the server's.
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
              <TableHead className="text-right">{t("Faol")}</TableHead>
              <TableHead className="text-right">{t("Erkak")}</TableHead>
              <TableHead className="text-right">{t("Ayol")}</TableHead>
              <TableHead className="text-right">{t("Noma'lum")}</TableHead>
              <TableHead className="text-right">{t("Aniq")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.male)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.female)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(unknownCount(r.total, r.genderKnown))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{shareText(r.genderKnown, r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">{t("«Aniq» — jinsi ma'lum o'quvchilar ulushi.")}</p>
      </CardContent>
    </Card>
  );
}
