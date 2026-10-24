"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import type { CenterOverview } from "./center-activity-types";

/** The whole page in one answer; a month or branch change keeps the old answer on screen until the new one lands. The header branch rides in the key (the server reads `X-Branch-Id`). */
export function useCenterOverview(params: Record<string, string | number>) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["center-activity-overview", branchId, params],
    queryFn: () => api.get<CenterOverview>("/reports/center-activity/overview", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}
