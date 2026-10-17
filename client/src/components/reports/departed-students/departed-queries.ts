"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import type { DepartedFilterOptions, DepartedList, DepartedOverview } from "./departed-types";

type Params = Record<string, string | number | boolean>;

/** The cards, charts and cuts in one answer; a filter change keeps the old answer on screen until the new one lands. The branch rides in the key (the server reads `X-Branch-Id`). */
export function useDepartedOverview(params: Params) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["departed-overview", branchId, params],
    queryFn: () => api.get<DepartedOverview>("/reports/departed-students/overview", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** One page of the departed-student list. */
export function useDepartedList(params: Params) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["departed-list", branchId, params],
    queryFn: () => api.get<DepartedList>("/reports/departed-students/list", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The course and teacher choices — the same endpoint the old page used. */
export function useDepartedFilterOptions() {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["departed-filter-options", branchId],
    queryFn: () => api.get<DepartedFilterOptions>("/reports/student-payments/filter-options").then((r) => r.data),
  });
}
