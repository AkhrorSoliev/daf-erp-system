"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatNumber } from "@/lib/format-utils";

type Result = "BEGINNER" | "A1" | "A2" | "B1" | "B2" | "UNKNOWN";
type DropKey = "to5" | "to10" | "to15" | "to19";

export interface LevelTestStats {
  month: string;
  started: number;
  people: number;
  finished: number;
  stopped: number;
  timedOut: number;
  cancelled: number;
  abandoned: number;
  running: number;
  quit: number;
  topDropOff: DropKey | null;
  byResult: Record<Result, number>;
  dropOff: Record<DropKey, number>;
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

const RESULT_ROWS: { key: Result; label: string }[] = [
  { key: "BEGINNER", label: msg("Boshlang'ich") },
  { key: "A1", label: "A1" },
  { key: "A2", label: "A2" },
  { key: "B1", label: "B1" },
  { key: "B2", label: "B2" },
  { key: "UNKNOWN", label: msg("Aniqlanmadi") },
];

const DROP_ROWS: { key: DropKey; range: string }[] = [
  { key: "to5", range: "1–4" },
  { key: "to10", range: "5–9" },
  { key: "to15", range: "10–14" },
  { key: "to19", range: "15–19" },
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-medium tabular-nums">{formatNumber(value)}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
      {label} {formatNumber(value)}
    </span>
  );
}

/** «Daraja testi» statistikasi (ADR-0122). Hamma son serverniki; mijoz faqat chizadi. */
export function BotLevelTests({ month }: { month: string }) {
  const t = useT();
  const { data, isError } = useLevelTestStats(month);
  if (isError) return null;
  if (!data || data.month !== month) return <Skeleton className="h-72" />;

  const { started } = data;
  const resultsTotal = RESULT_ROWS.reduce((s, r) => s + data.byResult[r.key], 0);
  const resultsMax = Math.max(1, ...RESULT_ROWS.map((r) => data.byResult[r.key]));
  const leftTotal = DROP_ROWS.reduce((s, r) => s + data.dropOff[r.key], 0);
  const dropMax = Math.max(1, ...DROP_ROWS.map((r) => data.dropOff[r.key]));
  const topRange = DROP_ROWS.find((r) => r.key === data.topDropOff)?.range;
  const GREEN = "#1D9E75";
  const AMBER = "#BA7517";
  const RED = "#E24B4A";
  const GRAY = "#B4B2A9";

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-4">
        <div>
          <p className="font-medium">{t("Daraja testi")}</p>
          <p className="text-sm text-muted-foreground">
            {t("Botdagi «Darajani aniqlash» tugmasi bo'yicha shu oy")}
          </p>
        </div>

        {started === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Bu oyda hech kim testni boshlamadi")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Metric
                label={t("Testni boshladi")}
                value={started}
                hint={`${formatNumber(data.people)} ${t("ta odam")}`}
              />
              <Metric
                label={t("Oxirigacha yechdi")}
                value={data.finished}
                hint={`${pct(data.finished, started)}% ${t("boshlaganlardan")}`}
              />
              <Metric
                label={t("Yarmida qoldi")}
                value={data.stopped + data.quit}
                hint={`${pct(data.stopped + data.quit, started)}% ${t("boshlaganlardan")}`}
              />
              <Metric label={t("Lid bo'ldi")} value={data.leads} hint={t("telefon qoldirdi")} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t("Boshlaganlar nima qildi")}</p>
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded">
                {[
                  { v: data.finished, c: GREEN },
                  { v: data.stopped, c: AMBER },
                  { v: data.quit, c: RED },
                  { v: data.running, c: GRAY },
                ].map((s, i) => (
                  <div key={i} style={{ flex: s.v, backgroundColor: s.c }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <Legend color={GREEN} label={t("Oxirigacha yechdi")} value={data.finished} />
                <Legend color={AMBER} label={t("O'zi to'xtatdi")} value={data.stopped} />
                <Legend color={RED} label={t("Tashlab ketdi")} value={data.quit} />
                <Legend color={GRAY} label={t("Hozir yechmoqda")} value={data.running} />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("Natija qaysi daraja chiqdi")}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {formatNumber(resultsTotal)} {t("ta natija")}
                  </span>
                </p>
                <div className="flex flex-col gap-2 text-sm">
                  {RESULT_ROWS.map((r) => (
                    <div key={r.key} className="grid grid-cols-[84px_1fr_36px] items-center gap-2">
                      <span>{t(r.label)}</span>
                      <div className="h-2.5 rounded bg-muted/60">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${pct(data.byResult[r.key], resultsMax)}%`,
                            backgroundColor: "#7F77DD",
                          }}
                        />
                      </div>
                      <span className="text-right tabular-nums">{data.byResult[r.key]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("Yarim qoldirganlar nechanchi savolda")}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {formatNumber(leftTotal)} {t("ta")}
                  </span>
                </p>
                <div className="flex h-24 items-end gap-2.5">
                  {DROP_ROWS.map((r) => (
                    <div key={r.key} className="flex flex-1 flex-col justify-end">
                      <div
                        className="rounded-t"
                        style={{
                          height: `${Math.max(2, pct(data.dropOff[r.key], dropMax))}%`,
                          backgroundColor: RED,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-2.5 text-center text-xs text-muted-foreground">
                  {DROP_ROWS.map((r) => (
                    <div key={r.key} className="flex-1">
                      {r.range}
                      <br />
                      <span className="font-medium text-foreground">{data.dropOff[r.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="border-t pt-2.5 text-sm text-muted-foreground">
              {topRange
                ? t("Ko'pchilik {range}-savollarda ketdi.", { range: topRange })
                : t("Hech kim yarmida qolmadi.")}{" "}
              <span className="text-xs">
                {t("O'quvchi")}: {formatNumber(data.students)} · {t("Boshqa")}:{" "}
                {formatNumber(data.others)}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
