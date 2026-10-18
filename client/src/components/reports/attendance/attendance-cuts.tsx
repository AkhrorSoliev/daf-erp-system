"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { CUT_COLUMN, CUT_LABEL, CUT_TITLE, TONE_BAR, hiddenText, pctText, rateTone } from "./attendance-format";
import { ATT_PAGE_SIZES } from "./attendance-url";
import type { AttendanceOverview, CutKey, CutRow } from "./attendance-types";

const CUT_ORDER: CutKey[] = ["group", "teacher", "course"];

/** Block 4 (spec §4): the lowest rates first, server-paged; «Ko'p qoldiruvchi» opens the list. */
export function AttendanceCuts({ selected, data, onCut, onPage, onPageSize, onMissers }: {
  selected: CutKey;
  data: AttendanceOverview["cut"];
  onCut: (cut: CutKey) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onMissers: (row: CutRow) => void;
}) {
  const t = useT();
  const hidden = hiddenText(data.hidden, data.minLessons, t);
  // The scanner reads `t(variable)`, not `t(MAP[key])`: the `msg()` texts go through locals.
  const title = CUT_TITLE[data.key];
  const column = CUT_COLUMN[data.key];
  const cuts = CUT_ORDER.map((k) => ({ key: k, label: CUT_LABEL[k] }));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t(title)}</p>
          <div role="group" aria-label={t("Kesim")} className="flex flex-wrap gap-1">
            {cuts.map(({ key: k, label }) => (
              <Button key={k} type="button" size="sm" variant={k === selected ? "default" : "outline"} aria-pressed={k === selected} onClick={() => onCut(k)}>
                {t(label)}
              </Button>
            ))}
          </div>
        </div>
        <div aria-live="polite" className="overflow-x-auto rounded-md border">
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>{t(column)}</TableHead>
                <TableHead>{t("Davomat")}</TableHead>
                <TableHead className="text-right">{t("Darslar soni")}</TableHead>
                <TableHead className="text-right">{t("Ko'p qoldiruvchi")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    {t("Ro'yxatga kiradigan qator yo'q")}
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r, i) => (
                  <TableRow key={r.key}>
                    <TableCell className="border-r text-muted-foreground tabular-nums">{(data.page - 1) * data.pageSize + i + 1}</TableCell>
                    <TableCell>
                      {r.name}
                      {r.deleted && <Badge variant="outline" className="ml-2">{t("o'chirilgan")}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted" aria-hidden>
                          <div className={cn("h-2 rounded-full", TONE_BAR[rateTone(r.rate)])} style={{ width: `${r.rate ?? 0}%` }} />
                        </div>
                        <span className="tabular-nums">{pctText(r.rate)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.lessons)}</TableCell>
                    <TableCell className="text-right">
                      {r.missers > 0 ? (
                        <Button
                          type="button" variant="link" size="sm" className="h-auto p-0 tabular-nums"
                          aria-label={t("{name}: ko'p qoldiruvchilar ro'yxati, {n} ta", { name: r.name, n: formatNumber(r.missers) })}
                          onClick={() => onMissers(r)}
                        >
                          {formatNumber(r.missers)}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <PaymentsPager
          page={data.page} pageSize={data.pageSize} total={data.total}
          onPage={onPage} onPageSize={onPageSize}
          sizes={ATT_PAGE_SIZES} sizeLabel={t("Sahifadagi qatorlar soni")}
        />
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <p>{t("Eng pastdan tartiblangan. Ro'yxatda yo'q qatorlar ham umumiy foizga kiradi, shuning uchun kesimlar yig'indisi umumiy sonlarga teng.")}</p>
          {hidden && <p>{hidden}</p>}
          {data.key === "teacher" && <p>{t("Ustoz — guruhning hozirgi ustozi; o'rinbosar o'tgan dars guruhning o'z ustoziga yoziladi.")}</p>}
          {data.key === "course" && <p>{t("Kurs — guruhning hozirgi kursi.")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
