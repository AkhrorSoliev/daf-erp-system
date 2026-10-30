"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MediaOvozTugmasi } from "./media-ovoz-tugmasi";
import { useJoriyMi, useNavbat } from "./media-pleyer";
import { useSectionInhalt } from "./media-queries";
import {
  bolimNavbati,
  sectionInhaltBosh,
  wortMatni,
} from "./media-inhalt-utils";
import type {
  InhaltDialog,
  InhaltDialogZeile,
  InhaltWort,
  InhaltZeile,
} from "./media-inhalt-types";

/** Audio ustuni: ovozi bor qatorda umumiy player tugmasi, yo'q bo'lsa chiziqcha. */
function OvozHujayrasi({ id, url }: { id: string; url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return <MediaOvozTugmasi id={id} />;
}

/** Hozir chalayotgan qatorni ajratadi. */
function OvozliQator({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const joriy = useJoriyMi(id);
  return <TableRow className={cn(joriy && "bg-primary/5")}>{children}</TableRow>;
}

function WoerterBlock({ woerter }: { woerter: InhaltWort[] }) {
  const t = useT();
  if (woerter.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("So'zlar")}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Nemischa")}</TableHead>
            <TableHead>{t("Tarjima")}</TableHead>
            <TableHead className="w-14">{t("Ovoz")}</TableHead>
            <TableHead className="w-24">{t("Holat")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {woerter.map((w) => (
            <OvozliQator key={w.id} id={`w${w.id}`}>
              <TableCell className="font-medium">{wortMatni(w)}</TableCell>
              <TableCell className="text-muted-foreground">
                {w.uz ?? "—"}
              </TableCell>
              <TableCell>
                <OvozHujayrasi id={`w${w.id}`} url={w.audioUrl} />
              </TableCell>
              <TableCell>
                {!w.core && (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground"
                    title={t("Bu so'zdan hech qachon savol tuzilmaydi va chalg'ituvchi sifatida ham ishlatilmaydi — shuning uchun mashqda ko'rinmaydi")}
                  >
                    {t("Passiv")}
                  </Badge>
                )}
              </TableCell>
            </OvozliQator>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Gap va ibora bir xil shaklda: nemischa, tarjima, ovoz. */
function ZeileBlock({
  title,
  rows,
  prefiks,
}: {
  title: string;
  rows: InhaltZeile[];
  prefiks: "s" | "p";
}) {
  const t = useT();
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Nemischa")}</TableHead>
            <TableHead>{t("Tarjima")}</TableHead>
            <TableHead className="w-14">{t("Ovoz")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <OvozliQator key={r.id} id={`${prefiks}${r.id}`}>
              <TableCell className="font-medium">{r.de}</TableCell>
              <TableCell className="text-muted-foreground">{r.uz}</TableCell>
              <TableCell>
                <OvozHujayrasi id={`${prefiks}${r.id}`} url={r.audioUrl} />
              </TableCell>
            </OvozliQator>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DialogBlock({
  // Standart `[]` — `dialoge` ixtiyoriy (`media-inhalt-types.ts`dagi izoh):
  // eski serverdan (deploy tartibi yoki rollback) kelgan javobda bu maydon
  // umuman yo'q bo'lishi mumkin, `undefined.length` esa sahifani yiqitardi.
  dialoge = [],
  rows,
}: {
  dialoge?: InhaltDialog[];
  rows: InhaltDialogZeile[];
}) {
  const t = useT();
  if (dialoge.length === 0 && rows.length === 0) return null;
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("Dialoglar")}</h3>
      {dialoge.map((d) => (
        <div key={d.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{d.titelDe}</div>
              <div className="text-xs text-muted-foreground">
                {d.titelUz}
              </div>
            </div>
            {/* Butun suhbatning ovozi — CEO namunani shu yerda eshitadi. */}
            <OvozHujayrasi id={`d${d.id}`} url={d.audioUrl} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("So'zlovchi")}</TableHead>
                <TableHead>{t("Nemischa")}</TableHead>
                <TableHead>{t("Tarjima")}</TableHead>
                <TableHead className="w-14">{t("Ovoz")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .filter((r) => r.dialogId === d.id)
                .map((r) => (
                  <OvozliQator key={r.id} id={`z${r.id}`}>
                    <TableCell className="text-muted-foreground">
                      {r.sprecher}
                    </TableCell>
                    <TableCell className="font-medium">{r.de}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.uz}
                    </TableCell>
                    <TableCell>
                      <OvozHujayrasi id={`z${r.id}`} url={r.audioUrl} />
                    </TableCell>
                  </OvozliQator>
                ))}
            </TableBody>
          </Table>
          {d.fragen.length > 0 && (
            <ul className="space-y-1 text-sm">
              {d.fragen.map((f) => (
                <li key={f.code}>
                  <span className="font-medium">{f.frageDe}</span>{" "}
                  <span className="text-muted-foreground">({f.frageUz})</span>
                  {" → "}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {f.richtig}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {f.falsch.join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Bitta bo'limning to'liq materiali — bo'lim tanlanganda /media'ning o'ng
 * panelida ochiladi. Har bir so'z/gap/ibora/dialog qatorini ko'rsatadi;
 * ovozlar umumiy playerda chaladi, navbat ekrandagi tartibda quriladi.
 * So'rov kaliti (`["media-inhalt", sectionId]`) umumiy keshda turadi:
 * bo'lim va seans panellari bir xil ma'lumotni qayta yuklamaydi.
 */
export function MediaInhaltPanel({ sectionId }: { sectionId: number }) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useSectionInhalt(sectionId);
  const navbat = React.useMemo(() => (data ? bolimNavbati(data) : []), [data]);
  useNavbat(navbat);

  return (
    <div className="space-y-6 p-4">
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{t("Bo'lim materiali olinmadi")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("Qayta urinish")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && sectionInhaltBosh(data) && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("Bu bo'limda hali material yo'q — kontentni bazaga yozadigan seed skriptini ({scripts}) ishga tushiring.", { scripts: "`daf:seed`/`daf:inhalt-seed`" })}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && !sectionInhaltBosh(data) && (
        <>
          <WoerterBlock woerter={data.woerter} />
          <ZeileBlock title={t("Gaplar")} rows={data.saetze} prefiks="s" />
          <ZeileBlock title={t("Iboralar")} rows={data.phrasen} prefiks="p" />
          <DialogBlock dialoge={data.dialoge} rows={data.dialogZeilen} />
        </>
      )}
    </div>
  );
}
