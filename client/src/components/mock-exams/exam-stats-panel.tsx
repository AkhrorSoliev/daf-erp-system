"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GraduationCap, Hourglass, Users, Wallet } from "lucide-react";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { MockKpiCard } from "./mock-kpi-card";
import type { MockExamStats } from "./exam-detail-types";
import {
  barPercent,
  channelHint,
  dafHint,
  hasLevels,
  hasTimeChoice,
  levelLabel,
  paidHint,
  resultRows,
  statsMethodLabel,
  timeLabel,
  unpaidHint,
} from "./mock-exam-stats";

/**
 * The statistics block on top of a mock exam's «Umumiy» tab (CEO, 30.09.2026).
 * It loads on its own, so a failure leaves the exam details below usable.
 */
export function ExamStatsPanel({ examId }: { examId: string }) {
  const t = useT();
  const [stats, setStats] = useState<MockExamStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MockExamStats>(`/mock-exams/${examId}/stats`)
      .then(({ data }) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Statistikani yuklab bo'lmadi.")}
      </p>
    );
  }
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const maxLevel = Math.max(0, ...stats.levels.map((l) => l.registered));

  return (
    <section aria-label={t("Imtihon statistikasi")} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MockKpiCard
          icon={<Wallet className="size-4" />}
          label={t("Tushgan pul")}
          value={<Som value={stats.money.paidSum} />}
          hint={paidHint(stats.money, t)}
        />
        <MockKpiCard
          icon={<Hourglass className="size-4" />}
          label={t("To'lanmagan")}
          value={<Som value={stats.money.unpaidSum} />}
          hint={unpaidHint(stats.money, t)}
        />
        <MockKpiCard
          icon={<Users className="size-4" />}
          label={t("Ro'yxatdan o'tgan")}
          value={stats.registered}
          hint={channelHint(stats.channel, t)}
        />
        <MockKpiCard
          icon={<GraduationCap className="size-4" />}
          label={t("DaF o'quvchisi")}
          value={stats.daf.student}
          hint={dafHint(stats.daf, t)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title={t("To'lov usuli")}>
          {stats.methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Hali to'lov yo'q")}
            </p>
          ) : (
            stats.methods.map((m) => (
              <Line
                key={m.method}
                label={statsMethodLabel(m.method, t)}
                value={`${m.count} · ${formatPrice(m.sum)}`}
              />
            ))
          )}
        </StatsCard>

        {hasLevels(stats) && (
          <StatsCard title={t("Darajalar")} note={t("yozilgan / to'lagan")}>
            {stats.levels.map((l) => (
              <div key={l.level ?? "none"} className="flex flex-col gap-1">
                <Line
                  label={levelLabel(l.level, t)}
                  value={`${l.registered} / ${l.paid}`}
                />
                {l.level !== null && (
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${barPercent(l.registered, maxLevel)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </StatsCard>
        )}

        {hasTimeChoice(stats) && (
          <StatsCard title={t("Imtihon vaqti")}>
            {stats.times.map((slot) => (
              <Line
                key={slot.time ?? "none"}
                label={timeLabel(slot.time, t)}
                value={t("{n} kishi", { n: slot.registered })}
              />
            ))}
          </StatsCard>
        )}

        {stats.results && (
          <StatsCard title={t("Natija yetib borishi")}>
            {resultRows(stats.results).map((r) => (
              <Line
                key={r.label}
                label={t(r.label)}
                value={t("{n} kishi", { n: r.value })}
              />
            ))}
          </StatsCard>
        )}
      </div>
    </section>
  );
}

function Som({ value }: { value: number }) {
  const t = useT();
  return (
    <span>
      {formatPrice(value)}{" "}
      <span className="text-xs text-muted-foreground">{t("so'm")}</span>
    </span>
  );
}

function StatsCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">
        {title}
        {note && (
          <>
            {" "}
            <span className="text-xs font-normal text-muted-foreground">
              {note}
            </span>
          </>
        )}
      </h3>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
