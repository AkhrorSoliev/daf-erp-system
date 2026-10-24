"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatShare } from "./departed-format";
import type { CutKey, DepartedOverview } from "./departed-types";

const CUT_LABEL: Record<CutKey, string> = { teacher: msg("Ustoz"), course: msg("Kurs"), group: msg("Guruh"), branch: msg("Filial") };
const CUTS = (["teacher", "course", "group", "branch"] as const).map((key) => ({ key, label: CUT_LABEL[key] }));

/** «Qayerdan ketishdi»: the same departures cut four ways (spec B7a §4.4). */
export function DepartedCuts({ cuts, uniqueDeparted, cut, onCutChange, isLoading }: {
  cuts: DepartedOverview["cuts"] | undefined;
  uniqueDeparted: number;
  cut: CutKey;
  onCutChange: (cut: CutKey) => void;
  isLoading?: boolean;
}) {
  const t = useT();
  const rows = cuts?.[cut];
  const cutLabel = CUT_LABEL[cut];
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t("Qayerdan ketishdi")}</p>
          <div role="group" aria-label={t("Kesim")} className="flex flex-wrap gap-1">
            {CUTS.map(({ key: k, label }) => (
              <Button key={k} type="button" size="sm" variant={k === cut ? "default" : "outline"} aria-pressed={k === cut} onClick={() => onCutChange(k)}>
                {t(label)}
              </Button>
            ))}
          </div>
        </div>
        {isLoading || !rows ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Bu davrda ketgan o'quvchi yo'q")}</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(cutLabel)}</TableHead>
                  <TableHead className="text-right">{t("Ketdi")}</TableHead>
                  <TableHead className="text-right">{t("Oy boshida")}</TableHead>
                  <TableHead className="text-right">{t("Ulushi")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.departed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.atStart)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.share === null ? <span className="text-muted-foreground">—</span> : formatShare(r.share)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {cut === "teacher" && rows && rows.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>{t("Ustoz — o'quvchi ketgan paytdagi ustozi. Ikki ustozli guruh ikkala ustozda sanaladi.")}</p>
            <p>{t("Jami (takrorlanmasdan):")} <b className="tabular-nums">{formatNumber(uniqueDeparted)}</b></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
