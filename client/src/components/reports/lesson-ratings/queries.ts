"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { LowRating, Paged, RatingSummary, TeacherRatings } from "./types";

// The branch rides in the header (api.ts); it is in the keys so a switch refetches.
export function useRatingSummary(month: string) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "summary", selectedBranch?.id, month],
    queryFn: () =>
      api.get<RatingSummary>("/lesson-ratings/summary", { params: { month } }).then((r) => r.data),
    staleTime: 0,
  });
}

export function useTeacherRatings(teacherId: number | null, month: string) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "teacher", selectedBranch?.id, teacherId, month],
    queryFn: () =>
      api
        .get<TeacherRatings>(`/lesson-ratings/teachers/${teacherId}`, { params: { month } })
        .then((r) => r.data),
    enabled: teacherId !== null,
    staleTime: 0,
  });
}

export function useLowRatings(month: string, page: number, pageSize: number, commented: boolean) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: ["lesson-ratings", "low", selectedBranch?.id, month, page, pageSize, commented],
    queryFn: () =>
      api
        .get<Paged<LowRating>>("/lesson-ratings/low", { params: { month, page, pageSize, commented: commented ? 1 : undefined },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}

export function useSetRatingEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<{ enabled: boolean }>("/lesson-ratings/settings", { enabled }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson-ratings", "summary"] }),
  });
}
