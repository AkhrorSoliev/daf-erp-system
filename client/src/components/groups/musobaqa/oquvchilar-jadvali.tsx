"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ProgressLine } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { maqsadFoizi, oxirgiMashqMatni } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

// Ustun "#" yo'q: ball bo'yicha o'rin faqat tartib bilan ko'rsatiladi.
// Sahifalanmaydi: guruh ≤ ~30 o'quvchi, ustoz hammani bir qarashda ko'radi (CLAUDE.md sahifalash qoidasiga ongli istisno).
export function OquvchilarJadvali({ data }: { data: MusobaqaJavob }) {
  const t = useT();
  const joriy = data.joriy;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="bg-muted sticky left-0 min-w-44">{t("O'quvchi")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Shu guruh bali")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Jami ball")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Faol kunlar")}</TableHead>
            {joriy && <TableHead scope="col" className="min-w-20 text-right">{t("Seriya")}</TableHead>}
            {joriy && <TableHead scope="col" className="min-w-36">{t("Bugungi maqsad")}</TableHead>}
            <TableHead scope="col" className="min-w-24">{t("Liga")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Nishonlar")}</TableHead>
            <TableHead scope="col" className="min-w-32">{t("Oxirgi mashq")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.oquvchilar.map((q) => {
            const foiz = maqsadFoizi(q.bugunBali, q.maqsadBali);
            return (
              <TableRow key={q.studentId}>
                <TableCell className="bg-background sticky left-0 font-medium">
                  {q.ism}
                  {!q.akkaunt && <span className="text-muted-foreground ml-2 text-xs">{t("Akkaunt yo'q")}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{q.guruhBali}</TableCell>
                <TableCell className={cn("text-right tabular-nums", q.jamiBall === 0 && "text-muted-foreground")}>
                  {q.jamiBall}
                </TableCell>
                <TableCell className="text-right tabular-nums">{q.faolKunlar} / 7</TableCell>
                {joriy && <TableCell className="text-right tabular-nums">{q.seriya ?? "—"}</TableCell>}
                {joriy && (
                  <TableCell>
                    {foiz === null ? (
                      "—"
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs tabular-nums">
                          {q.bugunBali} / {q.maqsadBali}
                        </span>
                        <ProgressLine value={q.bugunBali ?? 0} total={q.maqsadBali ?? 0} />
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell>{q.liga}</TableCell>
                <TableCell className="text-right tabular-nums">{q.nishonlar}</TableCell>
                <TableCell className="text-muted-foreground">{oxirgiMashqMatni(q.oxirgiMashq, data.bugun, t)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
