"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Receipt,
  Clock,
  Building2,
  Percent,
  Gift,
  RotateCcw,
  Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { PaymentReportCard } from "./payment-report-card";
import { ComingSoonCard } from "./coming-soon-card";
import { PaymentReportDialog } from "./payment-report-dialog";
import { BranchBreakdownDialog } from "./branch-breakdown-dialog";
import {
  PaymentReportsFilterBar,
  defaultFilter,
  resolveFilterRange,
  type PaymentReportsFilter,
} from "./payment-reports-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TeachersReportTable,
  type TeacherRow,
} from "./teachers-report-table";
import { TeacherGroupsDialog } from "./teacher-groups-dialog";

type CardKey = "totalPayments" | "onTimePayments" | "branchBreakdown" | "refunds";

interface PaymentReportsResponse {
  totalPayments: {
    current: number;
    previous: number;
    change: number;
    trend: { month: string; value: number }[];
  };
  onTimePayments: {
    current: { total: number; onTime: number; rate: number };
    previous: { total: number; onTime: number; rate: number };
    change: number;
    trend: { month: string; onTime: number; late: number; rate: number }[];
  };
  branchBreakdown: {
    current: number;
    previous: number;
    change: number;
    byBranch: { branchId: number; branchName: string; amount: number }[];
    trend: { month: string; value: number }[];
  };
  refunds: {
    current: number;
    previous: number;
    change: number;
    count: number;
    trend: { month: string; value: number }[];
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date | null): string | undefined {
  return d ? format(d, "yyyy-MM-dd") : undefined;
}

export function PaymentReportsClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const filter = useMemo<PaymentReportsFilter>(() => {
    const base = defaultFilter();
    const branchIdRaw = searchParams.get("branchId");
    const yearRaw = searchParams.get("year");
    const monthRaw = searchParams.get("month");
    const rangeStart = parseDate(searchParams.get("startDate"));
    const rangeEnd = parseDate(searchParams.get("endDate"));

    return {
      branchId:
        branchIdRaw && !Number.isNaN(Number(branchIdRaw))
          ? Number(branchIdRaw)
          : null,
      year:
        yearRaw && !Number.isNaN(Number(yearRaw)) ? Number(yearRaw) : base.year,
      month:
        monthRaw === null
          ? base.month
          : monthRaw === "all"
            ? null
            : Number.isNaN(Number(monthRaw))
              ? base.month
              : Number(monthRaw),
      rangeStart,
      rangeEnd,
    };
  }, [searchParams]);

  const writeParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const base = useMemo(() => defaultFilter(), []);

  const handleFilterChange = (next: PaymentReportsFilter) => {
    writeParams({
      branchId: next.branchId !== null ? String(next.branchId) : undefined,
      year: next.year === base.year ? undefined : String(next.year),
      month:
        next.month === base.month
          ? undefined
          : next.month === null
            ? "all"
            : String(next.month),
      startDate: formatDate(next.rangeStart),
      endDate: formatDate(next.rangeEnd),
    });
  };

  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
  const [months, setMonths] = useState<3 | 6>(6);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherRow | null>(
    null,
  );

  const range = useMemo(() => resolveFilterRange(filter), [filter]);
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: [
      "payment-reports",
      filter.branchId,
      startStr,
      endStr,
      months,
    ],
    queryFn: () =>
      api
        .get<PaymentReportsResponse>("/reports/payment-reports", {
          params: {
            branchId: filter.branchId ?? undefined,
            startDate: startStr,
            endDate: endStr,
            months,
          },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold tracking-tight">
          To&apos;lov hisobotlari
        </h2>
        <p className="text-sm text-muted-foreground">
          Markaz bo&apos;yicha to&apos;lovlar bo&apos;yicha umumiy hisobotlar
        </p>
      </div>

      <PaymentReportsFilterBar value={filter} onChange={handleFilterChange} />

      {isLoading || !data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Ma&apos;lumotlar yuklanmoqda...
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <PaymentReportCard
              icon={Receipt}
              label="Jami to'lov summasi"
              value={`${fmt(data.totalPayments.current)} so'm`}
              change={data.totalPayments.change}
              valueColor="text-green-600 dark:text-green-400"
              tooltip="Tanlangan davrdagi barcha tasdiqlangan to'lovlar yig'indisi"
              onClick={() => setActiveCard("totalPayments")}
            />

            <PaymentReportCard
              icon={Clock}
              label="Vaqtida to'lovlar"
              value={`${data.onTimePayments.current.rate}% (${data.onTimePayments.current.onTime}/${data.onTimePayments.current.total})`}
              change={data.onTimePayments.change}
              tooltip="O'quvchi yangi to'lov siklining birinchi darsiga kelgunicha to'lagan hollari. Yangi guruhlar uchun — birinchi 3 dars ichida."
              onClick={() => setActiveCard("onTimePayments")}
            />

            <PaymentReportCard
              icon={Building2}
              label="Filiallar bo'yicha"
              value={`${fmt(data.branchBreakdown.current)} so'm`}
              change={data.branchBreakdown.change}
              tooltip="Barcha filiallar bo'yicha tanlangan davrdagi jami to'lovlar. Tafsilotlar uchun bosing."
              onClick={() => setActiveCard("branchBreakdown")}
            />

            <ComingSoonCard icon={Percent} label="Jami chegirmalar summasi" />
            <ComingSoonCard icon={Gift} label="Jami bonus summasi" />

            <PaymentReportCard
              icon={RotateCcw}
              label="Qaytarilgan to'lovlar"
              value={`${fmt(data.refunds.current)} so'm`}
              change={data.refunds.change}
              valueColor={
                data.refunds.current > 0
                  ? "text-red-600 dark:text-red-400"
                  : undefined
              }
              tooltip={`Tanlangan davrda ${data.refunds.count} ta qaytarish muvaffaqiyatli yakunlandi`}
              onClick={() => setActiveCard("refunds")}
            />
          </div>

          <PaymentReportDialog
            open={activeCard === "totalPayments"}
            onOpenChange={(o) => !o && setActiveCard(null)}
            title="Jami to'lov summasi"
            description="Oylar bo'yicha to'lovlar dinamikasi"
            color="#16a34a"
            months={months}
            onMonthsChange={setMonths}
            trend={data.totalPayments.trend}
          />

          <PaymentReportDialog
            open={activeCard === "onTimePayments"}
            onOpenChange={(o) => !o && setActiveCard(null)}
            title="Vaqtida to'lovlar statistikasi"
            description="Vaqtida to'langan to'lovlar ulushi (%)"
            color="#2563eb"
            suffix="%"
            months={months}
            onMonthsChange={setMonths}
            trend={data.onTimePayments.trend.map((p) => ({
              month: p.month,
              value: p.rate,
            }))}
          />

          <BranchBreakdownDialog
            open={activeCard === "branchBreakdown"}
            onOpenChange={(o) => !o && setActiveCard(null)}
            byBranch={data.branchBreakdown.byBranch}
            trend={data.branchBreakdown.trend}
            months={months}
            onMonthsChange={setMonths}
          />

          <PaymentReportDialog
            open={activeCard === "refunds"}
            onOpenChange={(o) => !o && setActiveCard(null)}
            title="Qaytarilgan to'lovlar"
            description="Oylar bo'yicha qaytarilgan summalar dinamikasi"
            color="#dc2626"
            months={months}
            onMonthsChange={setMonths}
            trend={data.refunds.trend}
          />
        </>
      )}

      <Tabs defaultValue="teachers">
        <TabsList>
          <TabsTrigger value="teachers">O&apos;qituvchilar</TabsTrigger>
        </TabsList>
        <TabsContent value="teachers" className="mt-3">
          <TeachersReportTable
            branchId={filter.branchId}
            startDate={startStr}
            endDate={endStr}
            onRowClick={setSelectedTeacher}
          />
        </TabsContent>
      </Tabs>

      <TeacherGroupsDialog
        teacherId={selectedTeacher?.id ?? null}
        teacherName={selectedTeacher?.name ?? null}
        branchId={filter.branchId}
        startDate={startStr}
        endDate={endStr}
        onOpenChange={(o) => !o && setSelectedTeacher(null)}
      />
    </div>
  );
}
