"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Info, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadFunnelChart } from "./lead-funnel-chart";
import {
  buildFunnelRows,
  displayDate,
  FUNNEL_START_DATE,
  rangeIncludesToday,
  resolveRange,
} from "./lead-funnel-math";
import { LeadFunnelPeopleDialog } from "./lead-funnel-people-dialog";
import type { LeadFunnelResponse, PeopleStage } from "./lead-funnel-types";
import { LeadFunnelUnpaidCard } from "./lead-funnel-unpaid-card";

/** "YYYY-MM-DD" → mahalliy yarim tun (kalendar shu kunni belgilasin). */
function toPickerDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function LeadFunnelClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const [openStage, setOpenStage] = useState<PeopleStage | null>(null);

  const range = useMemo(
    () =>
      resolveRange(searchParams.get("startDate"), searchParams.get("endDate")),
    [searchParams],
  );

  const writeRange = useCallback(
    (next: { startDate: string; endDate: string } | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set("startDate", next.startDate);
        params.set("endDate", next.endDate);
      } else {
        params.delete("startDate");
        params.delete("endDate");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const setBound = (key: "startDate" | "endDate", d: Date | undefined) => {
    if (!d) return;
    const value = format(d, "yyyy-MM-dd");
    const next = { startDate: range.startDate, endDate: range.endDate };
    next[key] = value;
    // Oraliq buzilmasin: pickerlar bir-birini cheklaydi, bu esa URL'dan
    // qo'lda kiritilgan qiymat uchun zaxira.
    if (next.startDate > next.endDate) {
      if (key === "startDate") next.endDate = value;
      else next.startDate = value;
    }
    writeRange(next);
  };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [
      "reports",
      "lead-funnel",
      selectedBranch?.id ?? "all",
      range.startDate,
      range.endDate,
    ],
    queryFn: () =>
      api
        .get<LeadFunnelResponse>("/reports/lead-funnel", {
          params: { startDate: range.startDate, endDate: range.endDate },
        })
        .then((r) => r.data),
    enabled: branchLoaded,
  });

  const rows = useMemo(() => (data ? buildFunnelRows(data.stages) : []), [data]);
  const conversion = rows.length ? rows[rows.length - 1].pctOfFirst : null;
  const start = toPickerDate(range.startDate);
  const end = toPickerDate(range.endDate);
  const floor = toPickerDate(FUNNEL_START_DATE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Lidlar hisoboti
          </h2>
          <p className="text-sm text-muted-foreground">
            Markazga kelgan odam to&apos;lovgacha qaysi bosqichda tushib qolmoqda
          </p>
        </div>

        <div className="flex items-center gap-1">
          <DatePicker
            id="lead-funnel-start"
            value={start}
            onChange={(d) => setBound("startDate", d)}
            placeholder="Boshi"
            className="h-9 w-[140px]"
            minDate={floor}
            maxDate={end}
            defaultMonth={end}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <DatePicker
            id="lead-funnel-end"
            value={end}
            onChange={(d) => setBound("endDate", d)}
            placeholder="Oxiri"
            className="h-9 w-[140px]"
            minDate={start}
            defaultMonth={start}
          />
          {!range.isDefault && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => writeRange(null)}
              aria-label="Joriy oyga qaytish"
              title="Joriy oyga qaytish"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Voronkani yuklab bo&apos;lmadi.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <section className="rounded-xl border bg-card p-4 sm:p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Lid voronkasi</h3>
              {data && (
                <p className="text-sm text-muted-foreground">
                  Liddan to&apos;lovgacha:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatPercent(conversion)}
                  </span>
                </p>
              )}
            </div>

            {isPending || !data ? (
              <div className="space-y-3">
                {[1, 0.7, 0.5, 0.35].map((w) => (
                  <Skeleton
                    key={w}
                    className="mx-auto h-14 sm:h-16"
                    style={{ width: `${w * 100}%` }}
                  />
                ))}
              </div>
            ) : data.stages.lead === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Tanlangan davrda lid yo&apos;q — davrni kengaytirib ko&apos;ring.
              </p>
            ) : (
              <LeadFunnelChart
                rows={rows}
                leadSplit={data.leadSplit}
                onStageClick={setOpenStage}
              />
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Bosqichni bosing — o&apos;sha bosqichdagi odamlar ro&apos;yxati
              ochiladi.
            </p>
          </section>

          <div className="flex flex-col gap-4 lg:col-span-2">
            {isPending || !data ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : (
              <LeadFunnelUnpaidCard
                unpaid={data.unpaid}
                onOpen={() => setOpenStage("unpaid")}
              />
            )}

            <FunnelNotes range={range} total={data?.stages.lead} />
          </div>
        </div>
      )}

      <LeadFunnelPeopleDialog
        stage={openStage}
        range={range}
        onOpenChange={(open) => !open && setOpenStage(null)}
      />
    </div>
  );
}

function FunnelNotes({
  range,
  total,
}: {
  range: { startDate: string; endDate: string };
  total: number | undefined;
}) {
  const notes = [
    "Davrda kelgan lidlar olinadi va keyingi qadamlari davrdan keyin bo'lsa ham kuzatiladi. Bir odamning bir nechta lidi bitta hisoblanadi.",
  ];
  if (rangeIncludesToday(range)) {
    notes.push(
      "Davr hali tugamagan: yaqinda kelganlar keyingi bosqichlarga ulgurmagan, shuning uchun foizlar keyinroq oshadi.",
    );
  }
  notes.push(
    `Voronka ${displayDate(FUNNEL_START_DATE)} dan boshlab sanaydi — shu kundan har bir yangi o'quvchi lid yozuvi qoldiradi. Undan oldingi sanani tanlab bo'lmaydi.`,
  );

  return (
    <aside className="rounded-xl border bg-muted/30 p-4 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium">
        <Info className="size-4 text-muted-foreground" />
        Qanday o&apos;qiladi
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {total !== undefined && total > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          Jami {formatNumber(total)} kishi kuzatildi.
        </p>
      )}
    </aside>
  );
}
