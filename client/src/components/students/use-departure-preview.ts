import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { DeparturePreview } from "./departure-money";

/**
 * What removing (`enrollmentId`) or expelling (none) the student now would do
 * to the month's charge (`GET /students/:id/departure-preview`). Always fresh:
 * the answer depends on today's date and the balance, both of which move.
 */
export function useDeparturePreview(
  studentId: number | null | undefined,
  enrollmentId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery<DeparturePreview>({
    queryKey: ["departure-preview", studentId, enrollmentId ?? null],
    queryFn: () =>
      api
        .get<DeparturePreview>(`/students/${studentId}/departure-preview`, {
          params: enrollmentId ? { enrollmentId } : undefined,
        })
        .then((r) => r.data),
    enabled: enabled && !!studentId,
    staleTime: 0,
  });
}
