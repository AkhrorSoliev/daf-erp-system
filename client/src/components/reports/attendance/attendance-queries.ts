"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import type { AttendanceOverview, MissersPage } from "./attendance-types";
import { keepMissersFor, type MissersParams, type OverviewParams } from "./attendance-url";

/** The whole page in one answer; a change keeps the old answer on screen (dimmed) until the new one lands. The header branch rides in the key (the server reads `X-Branch-Id`). */
export function useAttendanceOverview(params: OverviewParams) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["attendance-overview", branchId, params],
    queryFn: () => api.get<AttendanceOverview>("/reports/attendance-stats/overview", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** One cut row's «ko'p qoldiruvchi» page; asked only while the dialog is open (`params` not null). */
export function useAttendanceMissers(params: MissersParams | null) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["attendance-missers", branchId, params],
    queryFn: () => api.get<MissersPage>("/reports/attendance-stats/missers", { params: params ?? undefined }).then((r) => r.data),
    enabled: params !== null,
    staleTime: 0,
    // Only the same row keeps its old answer (another page); a new row shows the skeleton, never the last row's students.
    placeholderData: (prev, prevQuery) => (keepMissersFor((prevQuery?.queryKey[2] as MissersParams | null) ?? null, params) ? prev : undefined),
  });
}
