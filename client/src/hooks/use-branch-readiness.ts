import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BranchReadiness } from "@/components/dashboard/launch/launch-types";

/**
 * `GET /branches/:id/readiness` — open only to the CEO and a branch director.
 * The caller decides `enabled` via `canSeeLaunchJourney`: the request MUST NOT
 * go out for an administrator, or a global 403 toast appears (`lib/api.ts`).
 */
export function useBranchReadiness(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["branch-readiness", branchId],
    queryFn: () =>
      api.get<BranchReadiness>(`/branches/${branchId}/readiness`).then((r) => r.data),
    enabled: enabled && branchId !== null,
    // The map should refresh immediately when a director completes a station
    // and returns to the home page.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
}
