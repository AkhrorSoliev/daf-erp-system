"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTree, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaDaraxt } from "./media-daraxt-view";
import { bolimJoyi, boshlangichTanlov, seansJoyi, tanlovParamlari, tanlovniOqi, type Tanlov } from "./media-daraxt";
import { MediaInhaltPanel } from "./media-inhalt-panel";
import { MediaPleyerPanel } from "./media-pleyer-panel";
import { useMediaCoverage } from "./media-queries";
import { MediaSeansPanel } from "./media-seans-panel";
import { MediaSinovQatlami } from "./media-sinov-qatlami";

/** /media — kursni o'quvchi yo'li bo'yicha ko'rib chiqish. */
export function MediaClient() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, refetch } = useMediaCoverage();
  const [sheet, setSheet] = React.useState(false);
  const [sinov, setSinov] = React.useState<number | null>(null);
  // Barqaror bo'lishi shart: qatlam effekti shunga bog'liq.
  const sinovniYop = React.useCallback(() => setSinov(null), []);

  const levels = data?.levels ?? [];
  const tanlov = tanlovniOqi((k) => searchParams.get(k)) ?? boshlangichTanlov(levels);

  const tanla = React.useCallback(
    (yangi: Tanlov) => {
      setSheet(false);
      router.replace(`${pathname}?${tanlovParamlari(yangi)}`, { scroll: false });
    },
    [pathname, router],
  );

  const daraxt = <MediaDaraxt levels={levels} tanlov={tanlov} onTanla={tanla} />;
  const bolim = tanlov?.tur === "bolim" ? bolimJoyi(levels, tanlov.id) : null;
  const seans = tanlov?.tur === "seans" ? seansJoyi(levels, tanlov.id) : null;
  const birinchi = boshlangichTanlov(levels);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:p-6">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-4 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">{!isLoading && daraxt}</div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("Media")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Har bir bo'lim va seansni o'quvchi ko'zi bilan ko'rib chiqish.")}
              </p>
            </div>
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setSheet(true)}>
              <ListTree className="mr-1.5 size-4" />
              {t("Bo'limlar")}
            </Button>
          </div>

          {isLoading && <Skeleton className="h-64 w-full rounded-lg" />}

          {!isLoading && isError && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
                <span>{t("Qamrov ma'lumoti olinmadi")}</span>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("Qayta urinib ko'rish")}
                </Button>
              </CardContent>
            </Card>
          )}

          {data && levels.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {t("Hali hech qanday unit yaratilmagan — kontentni bazaga yozadigan seed skriptini ({scripts}) ishga tushiring.", { scripts: "`daf:seed`/`daf:inhalt-seed`" })}
              </CardContent>
            </Card>
          )}

          {bolim && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{bolim.unit.titleUz}</div>
              <h2 className="text-lg font-semibold">{bolim.section.titleUz}</h2>
              <MediaInhaltPanel key={bolim.section.sectionId} sectionId={bolim.section.sectionId} />
            </div>
          )}

          {seans && (
            <MediaSeansPanel
              key={seans.lesson.id}
              lessonId={seans.lesson.id}
              joy={seans}
              onSinov={() => setSinov(seans.lesson.id)}
            />
          )}

          {data && levels.length > 0 && tanlov && !bolim && !seans && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
                <span>{t("Bu bo'lim yoki seans topilmadi")}</span>
                {birinchi && (
                  <Button size="sm" onClick={() => tanla(birinchi)}>
                    {t("Birinchi bo'limni ochish")}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <MediaPleyerPanel />

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="flex w-80 flex-col p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{t("Bo'limlar")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">{daraxt}</div>
        </SheetContent>
      </Sheet>

      {sinov !== null && <MediaSinovQatlami lessonId={sinov} onYop={sinovniYop} />}
    </div>
  );
}
