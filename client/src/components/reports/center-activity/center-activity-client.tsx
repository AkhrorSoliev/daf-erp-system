"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import {
  CenterActivityFilterBar,
  defaultCenterActivityFilter,
  resolveCenterActivityRange,
  type CenterActivityFilter,
} from "./center-activity-filter-bar";
import { CenterActivityKpiCards } from "./center-activity-kpi-cards";
import { PotentialRevenueDialog } from "./potential-revenue-dialog";
import { RoomsActivityTable } from "./rooms-activity-table";
import { EditRoomCapacityDialog } from "./edit-room-capacity-dialog";
import { BulkRoomCapacityDialog } from "./bulk-room-capacity-dialog";
import {
  MetricTrendDialog,
  type MetricKey,
} from "./metric-trend-dialog";
import {
  type CenterActivityResponse,
  type CenterActivityRoom,
  type CenterActivityBucket,
  BUCKET_LABELS,
} from "./metric-helpers";
import { AttendanceSection } from "../attendance/attendance-section";
import { Separator } from "@/components/ui/separator";

const BUCKETS: CenterActivityBucket[] = ["daily", "weekly", "monthly"];

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  try {
    return parse(value, "yyyy-MM-dd", new Date());
  } catch {
    return null;
  }
}

function readFilterFromUrl(
  searchParams: URLSearchParams,
): CenterActivityFilter {
  const base = defaultCenterActivityFilter();
  const branchId = searchParams.get("branchId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const start = parseDate(searchParams.get("startDate"));
  const end = parseDate(searchParams.get("endDate"));
  const bucket = searchParams.get("bucket") as CenterActivityBucket | null;

  return {
    ...base,
    branchId: branchId ? Number(branchId) : null,
    year: year ? Number(year) : base.year,
    month: month === null ? base.month : month === "all" ? null : Number(month),
    rangeStart: start,
    rangeEnd: end,
    bucket: bucket && BUCKETS.includes(bucket) ? bucket : "daily",
  };
}

function writeFilterToUrl(
  filter: CenterActivityFilter,
  defaults: CenterActivityFilter,
): string {
  const params = new URLSearchParams();
  if (filter.branchId !== defaults.branchId && filter.branchId !== null) {
    params.set("branchId", String(filter.branchId));
  }
  // Persist range dates independently so the user can pick start before
  // end (or vice-versa) without losing the in-progress selection.
  if (filter.rangeStart) {
    params.set("startDate", format(filter.rangeStart, "yyyy-MM-dd"));
  }
  if (filter.rangeEnd) {
    params.set("endDate", format(filter.rangeEnd, "yyyy-MM-dd"));
  }
  // Year/month only meaningful if a full custom range isn't set
  if (!filter.rangeStart || !filter.rangeEnd) {
    if (filter.year !== defaults.year) {
      params.set("year", String(filter.year));
    }
    if (filter.month !== defaults.month) {
      params.set("month", filter.month === null ? "all" : String(filter.month));
    }
  }
  if (filter.bucket !== defaults.bucket) {
    params.set("bucket", filter.bucket);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function CenterActivityClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const user = useAuth((s) => s.user);
  const fetchBranches = useBranchSwitcher((s) => s.fetchBranches);
  const branchesLoaded = useBranchSwitcher((s) => s.loaded);

  useEffect(() => {
    if (!branchesLoaded) fetchBranches();
  }, [branchesLoaded, fetchBranches]);

  const defaults = useMemo(() => defaultCenterActivityFilter(), []);
  const filter = useMemo(
    () => readFilterFromUrl(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilter = (next: CenterActivityFilter) => {
    const qs = writeFilterToUrl(next, defaults);
    router.replace(`/reports/activity${qs}`, { scroll: false });
  };

  const range = useMemo(() => resolveCenterActivityRange(filter), [filter]);

  const queryParams = useMemo(
    () => ({
      branchId: filter.branchId ?? undefined,
      startDate: format(range.start, "yyyy-MM-dd"),
      endDate: format(range.end, "yyyy-MM-dd"),
      bucket: filter.bucket,
    }),
    [filter.branchId, filter.bucket, range.start, range.end],
  );

  const { data, isLoading } = useQuery<CenterActivityResponse>({
    queryKey: ["center-activity", queryParams],
    queryFn: () =>
      api
        .get("/reports/center-activity", { params: queryParams })
        .then((r) => r.data),
    staleTime: 0,
  });

  const [potentialOpen, setPotentialOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [editRoom, setEditRoom] = useState<CenterActivityRoom | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const canEdit =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const handleRoomCapacitySaved = (
    updates: Array<{ id: string; capacity: number }>,
  ) => {
    queryClient.setQueryData<CenterActivityResponse | undefined>(
      ["center-activity", queryParams],
      (prev) => {
        if (!prev) return prev;
        const map = new Map(updates.map((u) => [u.id, u.capacity]));
        return {
          ...prev,
          rooms: prev.rooms.map((r) =>
            map.has(r.id) ? { ...r, capacity: map.get(r.id)! } : r,
          ),
        };
      },
    );
    queryClient.invalidateQueries({ queryKey: ["center-activity"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">
            Markaz faoliyat statistikasi
          </h2>
          <p className="text-sm text-muted-foreground">
            {range.label} — {BUCKET_LABELS[filter.bucket].toLowerCase()} kesim
            {data?.range.bucketUsed &&
              data.range.bucketUsed !== filter.bucket && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  (avtomatik {BUCKET_LABELS[data.range.bucketUsed].toLowerCase()}{" "}
                  kesimga o&apos;tildi)
                </span>
              )}
          </p>
        </div>
      </div>

      <CenterActivityFilterBar value={filter} onChange={setFilter} />

      <CenterActivityKpiCards
        kpis={data?.kpis}
        isLoading={isLoading}
        onPotentialClick={() => setPotentialOpen(true)}
        onMetricClick={(m) => setActiveMetric(m)}
      />

      <RoomsActivityTable
        rooms={data?.rooms ?? []}
        isLoading={isLoading}
        onEditRoom={(r) => setEditRoom(r)}
        onBulkEdit={() => setBulkOpen(true)}
        canEdit={canEdit}
      />

      <PotentialRevenueDialog
        open={potentialOpen}
        onClose={() => setPotentialOpen(false)}
        data={data?.potentialBreakdown}
      />

      <MetricTrendDialog
        open={activeMetric !== null}
        onClose={() => setActiveMetric(null)}
        metric={activeMetric}
        branchId={filter.branchId}
      />

      <EditRoomCapacityDialog
        open={editRoom !== null}
        onClose={() => setEditRoom(null)}
        room={
          editRoom
            ? {
                id: editRoom.id,
                name: editRoom.name,
                capacity: editRoom.capacity,
              }
            : null
        }
        onSaved={(capacity) => {
          if (editRoom) {
            handleRoomCapacitySaved([{ id: editRoom.id, capacity }]);
          }
        }}
      />

      <BulkRoomCapacityDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        rooms={data?.rooms ?? []}
        onSaved={handleRoomCapacitySaved}
      />

      <Separator className="my-8" />

      <AttendanceSection />
    </div>
  );
}
