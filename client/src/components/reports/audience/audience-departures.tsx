import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { pctText } from "./audience-format";
import type { DepartureBandRow } from "./audience-types";

/** A band where this share of the people left reads as a warning. */
const HIGH_SHARE = 30;

/**
 * Block 4: who left in the last 12 months, by age. Counts first; the share is
 * the server's (a dash while too few people stand behind it).
 */
export function AudienceDepartures({ rows, ageUnknown }: { rows: DepartureBandRow[]; ageUnknown: number }) {
  const t = useT();
  // The server's band labels are figures («12–15», «30+»), except the one in words, mapped by its code.
  const bandLabel = (b: DepartureBandRow) => (b.key === "u12" ? t("12 dan kichik") : b.label);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("Ketganlar yoshi")}</p>
          <p className="text-xs text-muted-foreground">{t("Oxirgi 12 oyda ketganlar, yoshi ma'lumlar ichida")}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Yosh")}</TableHead>
              <TableHead className="text-right">{t("Hozir o'qiydi")}</TableHead>
              <TableHead className="text-right">{t("Ketgan")}</TableHead>
              <TableHead className="text-right">{t("Ketish ulushi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{bandLabel(r)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.active)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.departed)}</TableCell>
                <TableCell
                  className={cn("text-right tabular-nums", r.share !== null && r.share >= HIGH_SHARE && "font-medium text-destructive")}
                >
                  {pctText(r.share)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {t("Ketish ulushi = ketgan ÷ (hozir o'qiydi + ketgan). Odam soni 5 tadan kam bo'lsa, foiz ko'rsatilmaydi.")}
        </p>
        {ageUnknown > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("Yoshi noma'lum ketganlar: {n} kishi", { n: formatNumber(ageUnknown) })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
