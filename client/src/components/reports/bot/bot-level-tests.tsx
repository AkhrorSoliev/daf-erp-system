"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";

export interface LevelTestStats {
  month: string;
  started: number;
  people: number;
  completed: number;
  stopped: number;
  timedOut: number;
  cancelled: number;
  abandoned: number;
  running: number;
  byResult: Record<"BEGINNER" | "A1" | "A2" | "B1" | "B2" | "UNKNOWN", number>;
  dropOff: { to5: number; to10: number; to15: number; to19: number };
  students: number;
  others: number;
  leads: number;
  total: number;
}

function useLevelTestStats(month: string) {
  return useQuery({
    queryKey: ["bot-report-level-tests", month],
    queryFn: () =>
      api
        .get<LevelTestStats>("/telegram/channel-report/level-tests", { params: { month } })
        .then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

/** «Daraja testi» statistikasi (ADR-0122). Hamma son serverniki; mijoz faqat chizadi. */
export function BotLevelTests({ month }: { month: string }) {
  const t = useT();
  const { data, isError } = useLevelTestStats(month);
  if (isError) return null;
  if (!data || data.month !== month) return <Skeleton className="h-56" />;

  const unfinished = data.stopped + data.timedOut + data.cancelled + data.abandoned;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-medium">{t("Daraja testi")}</p>
        {data.started === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Bu oyda hech kim testni boshlamadi")}
          </p>
        ) : (
          <div className="grid gap-6 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Row label={t("Boshlagan urinishlar")} value={data.started} />
              <Row label={t("Har xil odam")} value={data.people} />
              <Row label={t("Oxirigacha yechdi")} value={data.completed} />
              <Row label={t("Yarmida to'xtadi")} value={unfinished} />
              <Row label={t("Hozir yechilmoqda")} value={data.running} />
              <Row label={t("Telefon qoldirdi (lid)")} value={data.leads} />
              <Row label={t("O'quvchilar")} value={data.students} />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">{t("Natija bo'yicha")}</p>
              <Row label={t("Boshlang'ich")} value={data.byResult.BEGINNER} />
              <Row label="A1" value={data.byResult.A1} />
              <Row label="A2" value={data.byResult.A2} />
              <Row label="B1" value={data.byResult.B1} />
              <Row label="B2" value={data.byResult.B2} />
              <Row label={t("Aniqlanmadi")} value={data.byResult.UNKNOWN} />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">{t("Nechanchi savolda qoldi")}</p>
              <Row label={t("1–4 savol")} value={data.dropOff.to5} />
              <Row label={t("5–9 savol")} value={data.dropOff.to10} />
              <Row label={t("10–14 savol")} value={data.dropOff.to15} />
              <Row label={t("15–19 savol")} value={data.dropOff.to19} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
