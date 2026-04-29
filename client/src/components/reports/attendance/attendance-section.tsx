"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { TrendingDown, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AttendanceFilterBar,
  defaultAttendanceFilter,
  resolveAttendanceRange,
  type AttendanceFilter,
} from "./attendance-filter-bar";
import { AttendanceKpiCards } from "./attendance-kpi-cards";
import { AttendanceTrendChart } from "./attendance-trend-chart";
import { AttendanceDayOfWeekChart } from "./attendance-day-of-week-chart";
import { AttendanceStatusBreakdown } from "./attendance-status-breakdown";
import {
  AttendanceRankingsTabs,
  type AttendanceTab,
} from "./attendance-rankings-tabs";
import {
  ATTENDANCE_BUCKET_LABELS,
  formatAttendancePct,
  getAttendanceColor,
  getRetentionColor,
  type AttendanceAnalyticsResponse,
  type AttendanceBucket,
  type AttendanceCoursesResponse,
  type AttendanceGroupRanked,
  type AttendanceGroupsResponse,
  type AttendanceTeachersResponse,
  type GroupSortBy,
  type SortOrder,
  type TeacherSortBy,
} from "./metric-helpers";

const BUCKETS: AttendanceBucket[] = ["week", "month"];
const TABS: AttendanceTab[] = ["teachers", "groups", "courses"];
const TEACHER_SORTS: TeacherSortBy[] = ["rate", "groupsCount", "retention"];
const GROUP_SORTS: GroupSortBy[] = [
  "rate",
  "studentCount",
  "lessonCount",
  "retention",
];
const ORDERS: SortOrder[] = ["asc", "desc"];

const DEFAULT_PAGE_SIZE = 20;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  try {
    return parse(value, "yyyy-MM-dd", new Date());
  } catch {
    return null;
  }
}

interface ParsedState {
  filter: AttendanceFilter;
  tab: AttendanceTab;
  teachersPage: number;
  teachersPageSize: number;
  teachersSortBy: TeacherSortBy;
  teachersSortOrder: SortOrder;
  groupsPage: number;
  groupsPageSize: number;
  groupsSortBy: GroupSortBy;
  groupsSortOrder: SortOrder;
}

function readState(sp: URLSearchParams): ParsedState {
  const base = defaultAttendanceFilter();
  const branchId = sp.get("att_branchId");
  const year = sp.get("att_year");
  const month = sp.get("att_month");
  const start = parseDate(sp.get("att_startDate"));
  const end = parseDate(sp.get("att_endDate"));
  const bucket = sp.get("att_bucket") as AttendanceBucket | null;

  const tab = sp.get("att_tab") as AttendanceTab | null;
  const teachersPage = Number(sp.get("att_t_page") ?? "1") || 1;
  const teachersPageSize =
    Number(sp.get("att_t_size") ?? String(DEFAULT_PAGE_SIZE)) ||
    DEFAULT_PAGE_SIZE;
  const teachersSortBy = sp.get("att_t_sort") as TeacherSortBy | null;
  const teachersSortOrder = sp.get("att_t_ord") as SortOrder | null;

  const groupsPage = Number(sp.get("att_g_page") ?? "1") || 1;
  const groupsPageSize =
    Number(sp.get("att_g_size") ?? String(DEFAULT_PAGE_SIZE)) ||
    DEFAULT_PAGE_SIZE;
  const groupsSortBy = sp.get("att_g_sort") as GroupSortBy | null;
  const groupsSortOrder = sp.get("att_g_ord") as SortOrder | null;

  return {
    filter: {
      ...base,
      branchId: branchId ? Number(branchId) : null,
      year: year ? Number(year) : base.year,
      month:
        month === null ? base.month : month === "all" ? null : Number(month),
      rangeStart: start,
      rangeEnd: end,
      bucket: bucket && BUCKETS.includes(bucket) ? bucket : "week",
    },
    tab: tab && TABS.includes(tab) ? tab : "teachers",
    teachersPage: Math.max(1, teachersPage),
    teachersPageSize: Math.max(1, teachersPageSize),
    teachersSortBy:
      teachersSortBy && TEACHER_SORTS.includes(teachersSortBy)
        ? teachersSortBy
        : "rate",
    teachersSortOrder:
      teachersSortOrder && ORDERS.includes(teachersSortOrder)
        ? teachersSortOrder
        : "asc",
    groupsPage: Math.max(1, groupsPage),
    groupsPageSize: Math.max(1, groupsPageSize),
    groupsSortBy:
      groupsSortBy && GROUP_SORTS.includes(groupsSortBy) ? groupsSortBy : "rate",
    groupsSortOrder:
      groupsSortOrder && ORDERS.includes(groupsSortOrder)
        ? groupsSortOrder
        : "asc",
  };
}

function writeState(state: ParsedState, base: URLSearchParams): string {
  const params = new URLSearchParams(base);
  // Strip every att_* key first so we re-emit a clean snapshot
  Array.from(params.keys())
    .filter((k) => k.startsWith("att_"))
    .forEach((k) => params.delete(k));

  const defaults = defaultAttendanceFilter();
  const f = state.filter;

  if (f.branchId !== null) {
    params.set("att_branchId", String(f.branchId));
  }
  if (f.rangeStart) {
    params.set("att_startDate", format(f.rangeStart, "yyyy-MM-dd"));
  }
  if (f.rangeEnd) {
    params.set("att_endDate", format(f.rangeEnd, "yyyy-MM-dd"));
  }
  if (!f.rangeStart || !f.rangeEnd) {
    if (f.year !== defaults.year) params.set("att_year", String(f.year));
    if (f.month !== defaults.month) {
      params.set("att_month", f.month === null ? "all" : String(f.month));
    }
  }
  if (f.bucket !== defaults.bucket) {
    params.set("att_bucket", f.bucket);
  }

  if (state.tab !== "teachers") params.set("att_tab", state.tab);
  if (state.teachersPage !== 1)
    params.set("att_t_page", String(state.teachersPage));
  if (state.teachersPageSize !== DEFAULT_PAGE_SIZE)
    params.set("att_t_size", String(state.teachersPageSize));
  if (state.teachersSortBy !== "rate")
    params.set("att_t_sort", state.teachersSortBy);
  if (state.teachersSortOrder !== "asc")
    params.set("att_t_ord", state.teachersSortOrder);

  if (state.groupsPage !== 1)
    params.set("att_g_page", String(state.groupsPage));
  if (state.groupsPageSize !== DEFAULT_PAGE_SIZE)
    params.set("att_g_size", String(state.groupsPageSize));
  if (state.groupsSortBy !== "rate")
    params.set("att_g_sort", state.groupsSortBy);
  if (state.groupsSortOrder !== "asc")
    params.set("att_g_ord", state.groupsSortOrder);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface RankedListProps {
  title: string;
  icon: typeof TrendingUp;
  iconClass: string;
  groups: AttendanceGroupRanked[];
  emptyText: string;
}

function RankedGroupsList({
  title,
  icon: Icon,
  iconClass,
  groups,
  emptyText,
}: RankedListProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={cn("size-4", iconClass)} />
        <span>{title}</span>
      </div>
      {groups.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {groups.map((g, i) => (
            <li
              key={g.groupId}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="text-muted-foreground tabular-nums w-4 shrink-0">
                  {i + 1}.
                </span>
                <div className="min-w-0">
                  <div className="truncate">{g.groupName || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    Saqlanish:{" "}
                    <span
                      className={cn(
                        "tabular-nums",
                        getRetentionColor(g.retentionPct),
                      )}
                    >
                      {g.retentionPct === null
                        ? "—"
                        : `${g.retentionPct}%`}
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "tabular-nums font-semibold shrink-0",
                  getAttendanceColor(g.rate),
                )}
              >
                {formatAttendancePct(g.rate)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AttendanceSection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => readState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const updateState = useCallback(
    (next: Partial<ParsedState>) => {
      const merged: ParsedState = { ...state, ...next };
      const qs = writeState(
        merged,
        new URLSearchParams(searchParams.toString()),
      );
      router.replace(`/reports/activity${qs}`, { scroll: false });
    },
    [router, searchParams, state],
  );

  const range = useMemo(() => resolveAttendanceRange(state.filter), [state.filter]);

  const baseParams = useMemo(
    () => ({
      branchId: state.filter.branchId ?? undefined,
      startDate: format(range.start, "yyyy-MM-dd"),
      endDate: format(range.end, "yyyy-MM-dd"),
    }),
    [state.filter.branchId, range.start, range.end],
  );

  const analyticsParams = useMemo(
    () => ({ ...baseParams, bucket: state.filter.bucket }),
    [baseParams, state.filter.bucket],
  );

  const teachersParams = useMemo(
    () => ({
      ...baseParams,
      sortBy: state.teachersSortBy,
      sortOrder: state.teachersSortOrder,
      page: state.teachersPage,
      pageSize: state.teachersPageSize,
    }),
    [
      baseParams,
      state.teachersSortBy,
      state.teachersSortOrder,
      state.teachersPage,
      state.teachersPageSize,
    ],
  );

  const groupsParams = useMemo(
    () => ({
      ...baseParams,
      sortBy: state.groupsSortBy,
      sortOrder: state.groupsSortOrder,
      page: state.groupsPage,
      pageSize: state.groupsPageSize,
    }),
    [
      baseParams,
      state.groupsSortBy,
      state.groupsSortOrder,
      state.groupsPage,
      state.groupsPageSize,
    ],
  );

  const { data: analytics, isLoading: analyticsLoading } =
    useQuery<AttendanceAnalyticsResponse>({
      queryKey: ["attendance-analytics", analyticsParams],
      queryFn: () =>
        api
          .get("/reports/attendance-analytics", { params: analyticsParams })
          .then((r) => r.data),
      staleTime: 60_000,
    });

  const { data: teachersData, isLoading: teachersLoading } =
    useQuery<AttendanceTeachersResponse>({
      queryKey: ["attendance-teachers", teachersParams],
      queryFn: () =>
        api
          .get("/reports/teacher-performance", { params: teachersParams })
          .then((r) => r.data),
      staleTime: 60_000,
      enabled: state.tab === "teachers",
    });

  const { data: groupsData, isLoading: groupsLoading } =
    useQuery<AttendanceGroupsResponse>({
      queryKey: ["attendance-by-group", groupsParams],
      queryFn: () =>
        api
          .get("/reports/attendance-by-group", { params: groupsParams })
          .then((r) => r.data),
      staleTime: 60_000,
      enabled: state.tab === "groups",
    });

  const { data: coursesData, isLoading: coursesLoading } =
    useQuery<AttendanceCoursesResponse>({
      queryKey: ["attendance-by-course", baseParams],
      queryFn: () =>
        api
          .get("/reports/attendance-by-course", { params: baseParams })
          .then((r) => r.data),
      staleTime: 60_000,
      enabled: state.tab === "courses",
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Davomat statistikasi
          </h2>
          <p className="text-sm text-muted-foreground">
            {range.label} —{" "}
            {ATTENDANCE_BUCKET_LABELS[state.filter.bucket].toLowerCase()} kesim
          </p>
        </div>
      </div>

      <AttendanceFilterBar
        value={state.filter}
        onChange={(next) =>
          updateState({
            filter: next,
            // Reset all pages when filter changes
            teachersPage: 1,
            groupsPage: 1,
          })
        }
      />

      <AttendanceKpiCards
        overallRate={analytics?.overallRate ?? null}
        overallRetention={analytics?.overallRetention ?? null}
        statusBreakdown={analytics?.statusBreakdown}
        isLoading={analyticsLoading}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Davomat dinamikasi</h3>
            <span className="text-xs text-muted-foreground">
              {ATTENDANCE_BUCKET_LABELS[state.filter.bucket]} kesim
            </span>
          </div>
          <div className="h-[260px]">
            {analyticsLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Yuklanmoqda...
              </div>
            ) : (
              <AttendanceTrendChart data={analytics?.trend ?? []} />
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Holatlar taqsimoti</h3>
          <div className="h-[220px]">
            {analyticsLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Yuklanmoqda...
              </div>
            ) : (
              <AttendanceStatusBreakdown data={analytics?.statusBreakdown} />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Hafta kunlari bo&apos;yicha</h3>
          <div className="h-[220px]">
            {analyticsLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Yuklanmoqda...
              </div>
            ) : (
              <AttendanceDayOfWeekChart data={analytics?.byDayOfWeek ?? []} />
            )}
          </div>
        </div>
        <div className="space-y-3">
          <RankedGroupsList
            title="Eng yaxshi 5 guruh"
            icon={TrendingUp}
            iconClass="text-emerald-600 dark:text-emerald-400"
            groups={analytics?.bestGroups ?? []}
            emptyText="Ma'lumot yo'q"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Reytinglar</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Tartiblash uchun ustun nomini bosing. Tanlangan filtrlar barcha
            qatorlarga qo&apos;llaniladi.
          </p>
          <AttendanceRankingsTabs
            activeTab={state.tab}
            onTabChange={(tab) => updateState({ tab })}
            teachersData={teachersData}
            teachersLoading={teachersLoading}
            teachersPage={state.teachersPage}
            teachersPageSize={state.teachersPageSize}
            teachersSortBy={state.teachersSortBy}
            teachersSortOrder={state.teachersSortOrder}
            onTeachersPageChange={(p) => updateState({ teachersPage: p })}
            onTeachersPageSizeChange={(s) =>
              updateState({ teachersPageSize: s, teachersPage: 1 })
            }
            onTeachersSortChange={(sortBy, sortOrder) =>
              updateState({
                teachersSortBy: sortBy,
                teachersSortOrder: sortOrder,
                teachersPage: 1,
              })
            }
            groupsData={groupsData}
            groupsLoading={groupsLoading}
            groupsPage={state.groupsPage}
            groupsPageSize={state.groupsPageSize}
            groupsSortBy={state.groupsSortBy}
            groupsSortOrder={state.groupsSortOrder}
            onGroupsPageChange={(p) => updateState({ groupsPage: p })}
            onGroupsPageSizeChange={(s) =>
              updateState({ groupsPageSize: s, groupsPage: 1 })
            }
            onGroupsSortChange={(sortBy, sortOrder) =>
              updateState({
                groupsSortBy: sortBy,
                groupsSortOrder: sortOrder,
                groupsPage: 1,
              })
            }
            coursesData={coursesData}
            coursesLoading={coursesLoading}
          />
        </div>

        <div>
          <RankedGroupsList
            title="Diqqat talab qiluvchi 5 guruh"
            icon={TrendingDown}
            iconClass="text-red-600 dark:text-red-400"
            groups={analytics?.worstGroups ?? []}
            emptyText="Ma'lumot yo'q"
          />
        </div>
      </div>
    </div>
  );
}
