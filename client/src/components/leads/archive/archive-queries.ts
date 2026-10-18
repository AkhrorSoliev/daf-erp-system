import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ArchiveParams } from "./archive-url";
import type {
  ArchiveSummary,
  ArchivedLead,
  ArchivedLeadDetail,
  ArchivedSection,
  BoardColumn,
  Paged,
} from "./archive-types";

const ROOT = ["leads-archive"] as const;

export const archiveKeys = {
  summary: [...ROOT, "summary"] as const,
  leads: [...ROOT, "leads"] as const,
  sections: [...ROOT, "sections"] as const,
  board: [...ROOT, "board-columns"] as const,
};

/** Archive reads use staleTime 0: refetch on every mount and tab switch, since the global default is 5 minutes. */
export function useArchiveSummary() {
  return useQuery({
    queryKey: archiveKeys.summary,
    queryFn: async () =>
      (await api.get<ArchiveSummary>("/leads/archive/summary")).data,
    staleTime: 0,
  });
}

/** `enabled` is the open tab: only that tab asks the server. */
export function useArchivedLeads(params: ArchiveParams, enabled: boolean) {
  return useQuery({
    queryKey: [...archiveKeys.leads, params],
    queryFn: async () =>
      (await api.get<Paged<ArchivedLead>>("/leads/archive/leads", { params }))
        .data,
    enabled,
    staleTime: 0,
    placeholderData: (previous) => previous,
  });
}

export function useArchivedSections(params: ArchiveParams, enabled: boolean) {
  return useQuery({
    queryKey: [...archiveKeys.sections, params],
    queryFn: async () =>
      (
        await api.get<Paged<ArchivedSection>>("/leads/archive/sections", {
          params,
        })
      ).data,
    enabled,
    staleTime: 0,
    placeholderData: (previous) => previous,
  });
}

/** The live board, read only when a restore dialog opens. */
export function useBoardColumns(enabled: boolean) {
  return useQuery({
    queryKey: archiveKeys.board,
    queryFn: async () => (await api.get<BoardColumn[]>("/leads/board")).data,
    enabled,
    staleTime: 60_000,
  });
}

/** One archived lead for the side panel; `staleTime: 0` so it is fresh on each open. */
export function useArchivedLeadDetail(id: string) {
  return useQuery({
    queryKey: [...archiveKeys.leads, "detail", id],
    queryFn: async () =>
      (await api.get<ArchivedLeadDetail>(`/leads/archive/leads/${id}`)).data,
    enabled: !!id,
    staleTime: 0,
    retry: false,
  });
}
