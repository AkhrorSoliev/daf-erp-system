"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import type { AudienceOverview } from "./audience-types";

/** The whole page in one answer. The header branch rides in the key (the server reads `X-Branch-Id`). */
export function useAudienceOverview() {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["audience-overview", branchId],
    queryFn: () => api.get<AudienceOverview>("/reports/audience/overview").then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}
