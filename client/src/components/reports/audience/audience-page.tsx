"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { cn } from "@/lib/utils";
import { AudienceCutTable } from "./audience-cuts";
import { AudienceDepartures } from "./audience-departures";
import { AudienceNumbers, AudienceNumbersSkeleton } from "./audience-numbers";
import { useAudienceOverview } from "./audience-queries";

/** «Auditoriya»: who studies here. Every figure is the server's; the page only arranges and formats. No branch picker: it follows the header. */
export function AudiencePage() {
  const t = useT();
  const { data, isPlaceholderData, isError, refetch } = useAudienceOverview();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">{t("Auditoriya")}</h2>
        <p className="text-sm text-muted-foreground">{t("Tanlangan filial · hozirgi holat")}</p>
      </div>

      {isError && !data ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>{t("Ma'lumotni yuklab bo'lmadi")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : !data ? (
        <AudienceNumbersSkeleton />
      ) : data.systemTotal === 0 && data.summary.total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("Bu filialda hozir o'qiyotgan o'quvchi yo'q — boshqa filialni tanlab ko'ring.")}
          </CardContent>
        </Card>
      ) : (
        // The previous answer stays dimmed and inert until the next one lands (a branch switch).
        <div aria-busy={isPlaceholderData} className={cn("flex flex-col gap-4", isPlaceholderData && "pointer-events-none opacity-60")}>
          <AudienceNumbers systemTotal={data.systemTotal} s={data.summary} />
          <AudienceCutTable title={msg("Yo'nalish bo'yicha")} nameHead={msg("Yo'nalish")} rows={data.levels} />
          <AudienceCutTable title={msg("Kurs bo'yicha")} nameHead={msg("Kurs")} rows={data.courses} />
          <AudienceDepartures rows={data.departures} ageUnknown={data.departuresAgeUnknown} />
        </div>
      )}
    </div>
  );
}
