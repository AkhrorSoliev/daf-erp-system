"use client";

import * as React from "react";
import { Play, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import { formatNomi } from "@/lib/daf-format-nomlari";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SavolQatori } from "./media-fragen-panel";
import { SEANS_NOMLARI, type SeansJoyi } from "./media-daraxt";
import { useNavbat } from "./media-pleyer";
import { useLessonFragen } from "./media-queries";
import { kalitla, seansGuruhlari, seansNavbati } from "./media-seans";

/**
 * Seans sahifasi: shu seansdan chiqishi mumkin bo'lgan BARCHA savollar,
 * to'g'ri javobi bilan. Seans har safar shulardan tasodifiy tanlaydi.
 */
export function MediaSeansPanel({
  lessonId,
  joy,
  onSinov,
}: {
  lessonId: number;
  joy: SeansJoyi;
  onSinov: () => void;
}) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useLessonFragen(lessonId);
  const fragen = React.useMemo(() => kalitla(data?.fragen ?? []), [data]);
  const guruhlar = React.useMemo(() => seansGuruhlari(fragen, data?.bevorzugt ?? []), [fragen, data]);
  const navbat = React.useMemo(() => seansNavbati(guruhlar), [guruhlar]);
  useNavbat(navbat);
  const seansNomi = SEANS_NOMLARI[joy.lesson.kind];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">
            {joy.unit.titleUz}
            {joy.section ? ` › ${joy.section.titleUz}` : ""}
          </div>
          <h2 className="text-lg font-semibold">{t(seansNomi)}</h2>
          {data && (
            <p className="text-sm text-muted-foreground">
              {t("Har safar shu savollardan {n} tasi tanlanadi", { n: data.laenge })}
              {" · "}
              {t("{n} ta savol", { n: data.fragen.length })}
              {" · "}
              {t("{n} xil mashq", { n: guruhlar.length })}
            </p>
          )}
        </div>
        <Button onClick={onSinov} disabled={!data || data.fragen.length === 0}>
          <Play className="mr-1.5 size-4" />
          {t("O'quvchi kabi o'tib ko'rish")}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{t("Seans savollari olinmadi")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 size-3.5" />
              {t("Qayta urinib ko'rish")}
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.fragen.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("Bu seans uchun hali savol yo'q — bo'limda material yetarli emas.")}
          </CardContent>
        </Card>
      )}

      {guruhlar.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {guruhlar.map((g) => {
            const nom = formatNomi(g.format, t);
            return (
            <button
              key={g.format}
              type="button"
              aria-label={g.afzal ? t("{nom} — bu seansda ko'proq chiqadi", { nom }) : undefined}
              onClick={() =>
                document.getElementById(`mashq-${g.format}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              {g.afzal && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
              {nom} <span className="tabular-nums text-muted-foreground">{g.fragen.length}</span>
            </button>
            );
          })}
        </div>
      )}

      {guruhlar.map((g) => (
        <section key={g.format} id={`mashq-${g.format}`} className="scroll-mt-4 space-y-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {formatNomi(g.format, t)}
            <span className="text-xs font-normal text-muted-foreground">{t("{n} ta savol", { n: g.fragen.length })}</span>
            {g.afzal && <Badge variant="secondary">{t("Bu seansda ko'proq chiqadi")}</Badge>}
          </h3>
          {(g.format === "PAAR" || g.format === "ZUORDNEN" || g.format === "DIALOG_LUECKE") && (
            <p className="text-xs text-muted-foreground">
              {t("Bu turdagi savollarda to'plam har safar boshqacha tanlanadi — bu yerda namunasi.")}
            </p>
          )}
          <div className="space-y-2">
            {g.fragen.map((f) => (
              <SavolQatori key={f.kalit} f={f} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
