"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { AudienceBands } from "./audience-bands";
import { AudienceCardsSkeleton, AudienceCoverage, AudienceHeadline } from "./audience-cards";
import { AudienceCutTable } from "./audience-cuts";
import { useAudienceOverview } from "./audience-queries";

/** «Auditoriya»: who studies here. Every figure is the server's; the page only arranges and formats. No branch picker: it follows the header. */
export function AudiencePage() {
  const { data, isPlaceholderData, isError, refetch } = useAudienceOverview();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">Auditoriya</h2>
        <p className="text-sm text-muted-foreground">
          Hozir o&apos;qiyotgan o&apos;quvchilar{data ? ` · ${formatNumber(data.summary.total)} kishi` : ""}
        </p>
      </div>

      {isError && !data ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : !data ? (
        <AudienceCardsSkeleton />
      ) : data.summary.total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Bu filialda hozir o&apos;qiyotgan o&apos;quvchi yo&apos;q — boshqa filialni tanlab ko&apos;ring.
          </CardContent>
        </Card>
      ) : (
        // The previous answer stays dimmed and inert until the next one lands (a branch switch).
        <div aria-busy={isPlaceholderData} className={cn("flex flex-col gap-4", isPlaceholderData && "pointer-events-none opacity-60")}>
          <AudienceCoverage s={data.summary} />
          <AudienceHeadline s={data.summary} />
          <AudienceBands bands={data.bands} />
          <AudienceCutTable title="Kurs bo'yicha" nameHead="Kurs" rows={data.courses} />
          <AudienceCutTable title="Filial bo'yicha" nameHead="Filial" rows={data.branches} />
        </div>
      )}
    </div>
  );
}
