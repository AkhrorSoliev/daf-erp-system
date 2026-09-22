"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { resolveHomeSections } from "./dashboard-home-visibility";
import type { DashboardCharts } from "./dashboard-charts-types";
import { ChartAttendance } from "./chart-attendance";
import { ChartMoneyTrend } from "./chart-money-trend";
import { ChartProfitBreakdownCard } from "./chart-profit-breakdown";
import { ChartStudentFlow } from "./chart-student-flow";
import { HomeErrorNote } from "./home-error-note";

/**
 * Bosh sahifadagi diagrammalar.
 *
 * Sanagichlardan ALOHIDA so'rov bilan keladi va `enabled: ready` orqali
 * ulardan KEYIN yuboriladi. Sabab: `/dashboard/summary` sovuq keshda ~7 s
 * ochiladi; diagrammalarni o'sha javobga qo'shish sahifaning o'zagini ham
 * shuncha kuttirardi. Endi kartalar avvalgi tezligida chiqadi, diagrammalar
 * esa o'z o'rnida skeleton ko'rsatib turadi.
 */
export function HomeCharts({ ready }: { ready: boolean }) {
  const user = useAuth((s) => s.user);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const sections = resolveHomeSections(roleIds);

  // Kassirga diagramma yo'q — manbalar `/reports/*` servislari, ular unga
  // ochiq emas. `attention` bor, lekin `attentionOutreachRows` yo'q — aynan
  // shu kassirni ajratadi.
  const maySeeCharts = sections.attentionOutreachRows;

  const { data, isPending, isError } = useQuery({
    queryKey: ["dashboard", "charts", selectedBranch?.id ?? "all"],
    queryFn: () =>
      api
        .get<DashboardCharts>("/dashboard/charts", {
          params: selectedBranch ? { branchId: selectedBranch.id } : undefined,
        })
        .then((r) => r.data),
    enabled: branchLoaded && ready && maySeeCharts,
    staleTime: 5 * 60_000,
  });

  if (!maySeeCharts) return null;
  if (isError) return <HomeErrorNote label="Diagrammalar" />;
  if (isPending || !data) return <ChartsSkeleton showMoney={sections.money} />;

  const failed = (s: string) => data.failed.includes(s);

  return (
    <div className="space-y-3 sm:space-y-4">
      {sections.money && (
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          {data.money ? (
            <>
              <ChartMoneyTrend data={data.money.trend} />
              {data.money.breakdown ? (
                <ChartProfitBreakdownCard data={data.money.breakdown} />
              ) : (
                <HomeErrorNote label="Foyda tarkibi" />
              )}
            </>
          ) : failed("money") ? (
            <HomeErrorNote label="Moliya diagrammalari" />
          ) : null}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {data.students ? (
          <ChartStudentFlow data={data.students} />
        ) : failed("students") ? (
          <HomeErrorNote label="O'quvchilar oqimi" />
        ) : null}
        {data.attendance ? (
          <ChartAttendance data={data.attendance} />
        ) : failed("attendance") ? (
          <HomeErrorNote label="Davomat" />
        ) : null}
      </div>
    </div>
  );
}

function ChartsSkeleton({ showMoney }: { showMoney: boolean }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      {showMoney && (
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          <Skeleton className="h-[316px] rounded-xl" />
          <Skeleton className="h-[316px] rounded-xl" />
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <Skeleton className="h-[316px] rounded-xl" />
        <Skeleton className="h-[316px] rounded-xl" />
      </div>
    </div>
  );
}
