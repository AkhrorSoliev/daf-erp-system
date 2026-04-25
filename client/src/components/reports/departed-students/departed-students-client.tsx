"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { format } from "date-fns";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  DepartedStudentsFilterBar,
  defaultFilter,
  resolveDateRange,
  type DepartedStudentsFilter,
  type DepartedStudentsFilterOptions,
  type MonthsPreset,
} from "./departed-students-filter-bar";
import { DepartureReasonsDialog } from "./departure-reasons-dialog";
import {
  DepartedStudentsKpiCards,
  type DepartedStudentsSummary,
} from "./departed-students-kpi-cards";
import { DepartedStudentsDynamicsChart } from "./departed-students-dynamics-chart";
import { DepartedStudentsReasonsChart } from "./departed-students-reasons-chart";
import {
  DepartedStudentsGroupByChart,
  type GroupByDimension,
} from "./departed-students-group-by-chart";
import {
  DepartedStudentsTable,
  type DepartedStudentRow,
} from "./departed-students-table";
import { TeacherChangeRetentionCards } from "./teacher-change-retention-cards";
import { TeacherChangeReasonsChart } from "./teacher-change-reasons-chart";
import { TransferReasonsChart } from "./transfer-reasons-chart";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VALID_PRESETS: readonly MonthsPreset[] = [
  "current_month",
  "last_month",
  "3m",
  "6m",
  "12m",
];

const VALID_GROUP_BY: readonly GroupByDimension[] = [
  "course",
  "teacher",
  "branch",
];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date | null): string | undefined {
  return d ? format(d, "yyyy-MM-dd") : undefined;
}

interface FilterOptionsResponse {
  courses: { id: string; name: string }[];
  teachers: { id: number; fullName: string }[];
}

export function DepartedStudentsClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);

  const canManageReasons =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const filter = useMemo<DepartedStudentsFilter>(() => {
    const base = defaultFilter();
    const branchIdRaw = searchParams.get("branchId");
    const branchId = branchIdRaw ? Number(branchIdRaw) : null;
    const presetRaw = searchParams.get("preset");
    return {
      preset:
        presetRaw && VALID_PRESETS.includes(presetRaw as MonthsPreset)
          ? (presetRaw as MonthsPreset)
          : base.preset,
      rangeStart: parseDate(searchParams.get("startDate")),
      rangeEnd: parseDate(searchParams.get("endDate")),
      branchId: branchId && !Number.isNaN(branchId) ? branchId : null,
      courseId: searchParams.get("courseId") || null,
      teacherIds:
        searchParams
          .get("teacherIds")
          ?.split(",")
          .map((v) => Number(v))
          .filter((n) => !Number.isNaN(n)) ?? [],
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

  const handleFilterChange = (next: DepartedStudentsFilter) => {
    writeParams({
      preset: next.preset ?? undefined,
      startDate: formatDate(next.rangeStart),
      endDate: formatDate(next.rangeEnd),
      branchId: next.branchId !== null ? String(next.branchId) : undefined,
      courseId: next.courseId ?? undefined,
      teacherIds:
        next.teacherIds.length > 0 ? next.teacherIds.join(",") : undefined,
      page: undefined,
    });
  };

  // Reuse the filter-options endpoint already exposed by the student-payments
  // report — same shape (courses + teachers), same role scope (CEO/BD/Admin is
  // a subset of its CEO/BD/Admin/Cashier access). Extra `groups` field is ignored.
  const { data: options } = useQuery<FilterOptionsResponse>({
    queryKey: ["reports-filter-options"],
    queryFn: () =>
      api
        .get<FilterOptionsResponse>("/reports/student-payments/filter-options")
        .then((r) => r.data),
  });

  const filterOptions: DepartedStudentsFilterOptions = useMemo(
    () => ({
      courses: options?.courses ?? [],
      teachers: options?.teachers ?? [],
    }),
    [options],
  );

  const range = useMemo(() => resolveDateRange(filter), [filter]);
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const rawSummaryParams = useMemo(
    () => ({
      branchId: filter.branchId ?? undefined,
      courseId: filter.courseId ?? undefined,
      teacherIds:
        filter.teacherIds.length > 0 ? filter.teacherIds.join(",") : undefined,
      startDate: startStr,
      endDate: endStr,
    }),
    [filter.branchId, filter.courseId, filter.teacherIds, startStr, endStr],
  );

  // Debounce so rapid filter changes (multi-select, quick preset swaps) only
  // trigger one request instead of N.
  const summaryParams = useDebouncedValue(rawSummaryParams, 250);

  const { data: summary, isLoading: summaryLoading } =
    useQuery<DepartedStudentsSummary>({
      queryKey: ["departed-students-summary", summaryParams],
      queryFn: () =>
        api
          .get<DepartedStudentsSummary>("/reports/departed-students/summary", {
            params: summaryParams,
          })
          .then((r) => r.data),
      staleTime: 0,
    });

  const groupByRaw = searchParams.get("groupBy");
  const groupBy: GroupByDimension =
    groupByRaw && VALID_GROUP_BY.includes(groupByRaw as GroupByDimension)
      ? (groupByRaw as GroupByDimension)
      : "course";

  const handleGroupByChange = (next: GroupByDimension) => {
    writeParams({ groupBy: next === "course" ? undefined : next });
  };

  const tablePage = Math.max(1, Number(searchParams.get("page")) || 1);
  const tablePageSize = (() => {
    const raw = Number(searchParams.get("pageSize"));
    return [10, 20, 30, 40, 50].includes(raw) ? raw : 10;
  })();

  const listParams = {
    ...summaryParams,
    page: tablePage,
    pageSize: tablePageSize,
  };

  const { data: listData, isLoading: listLoading } = useQuery<{
    data: DepartedStudentRow[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["departed-students-list", listParams],
    queryFn: () =>
      api
        .get("/reports/departed-students/list", { params: listParams })
        .then((r) => r.data),
    staleTime: 0,
  });

  const total = listData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / tablePageSize));
  const clampedPage = Math.min(tablePage, totalPages);

  const handlePageSizeChange = (size: number) => {
    writeParams({
      pageSize: size === 10 ? undefined : String(size),
      page: undefined,
    });
  };

  const handlePageChange = (nextPage: number) => {
    writeParams({ page: nextPage === 1 ? undefined : String(nextPage) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Ketish va guruh o&apos;zgarishi tahlili
          </h2>
          <p className="text-sm text-muted-foreground">
            Saqlab qolishni tahlil qilish, xavflarni aniqlash va LTVni oshirishga yordam beradi
          </p>
        </div>
        {canManageReasons && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ketish sabablarini boshqarish"
            title="Ketish sabablarini boshqarish"
            className="shrink-0"
          >
            <Settings className="size-4" />
          </Button>
        )}
      </div>

      <DepartedStudentsFilterBar
        value={filter}
        onChange={handleFilterChange}
        options={filterOptions}
      />

      <DepartedStudentsKpiCards data={summary} isLoading={summaryLoading} />

      <TeacherChangeRetentionCards
        data={
          summary
            ? {
                totalTeacherChanges: summary.totalTeacherChanges,
                departedAfterTeacherChange: summary.departedAfterTeacherChange,
              }
            : undefined
        }
        isLoading={summaryLoading}
        queryParams={summaryParams}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <TeacherChangeReasonsChart
          branchId={filter.branchId}
          courseId={filter.courseId}
          teacherIds={filter.teacherIds}
          startDate={startStr}
          endDate={endStr}
        />
        <TransferReasonsChart
          branchId={filter.branchId}
          courseId={filter.courseId}
          teacherIds={filter.teacherIds}
          startDate={startStr}
          endDate={endStr}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DepartedStudentsDynamicsChart
          branchId={filter.branchId}
          courseId={filter.courseId}
          teacherIds={filter.teacherIds}
          startDate={startStr}
          endDate={endStr}
        />
        <DepartedStudentsReasonsChart
          branchId={filter.branchId}
          courseId={filter.courseId}
          teacherIds={filter.teacherIds}
          startDate={startStr}
          endDate={endStr}
        />
      </div>

      <DepartedStudentsGroupByChart
        branchId={filter.branchId}
        courseId={filter.courseId}
        teacherIds={filter.teacherIds}
        startDate={startStr}
        endDate={endStr}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
      />

      <DepartedStudentsTable
        data={listData?.data}
        isLoading={listLoading}
        page={clampedPage}
        pageSize={tablePageSize}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sahifada:</span>
          <Select
            value={String(tablePageSize)}
            onValueChange={(v) => handlePageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 30, 40, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            Jami:{" "}
            <span className="tabular-nums">
              {total.toLocaleString("en-US")}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {clampedPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={clampedPage <= 1}
            onClick={() => handlePageChange(clampedPage - 1)}
            aria-label="Oldingi"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={clampedPage >= totalPages}
            onClick={() => handlePageChange(clampedPage + 1)}
            aria-label="Keyingi"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {canManageReasons && (
        <DepartureReasonsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
    </div>
  );
}
