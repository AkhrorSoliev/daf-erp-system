import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ArchiveParams } from "./archive-url";
import type {
  ArchiveSummary,
  ArchivedLead,
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

export function useArchiveSummary() {
  return useQuery({
    queryKey: archiveKeys.summary,
    queryFn: async () =>
      (await api.get<ArchiveSummary>("/leads/archive/summary")).data,
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
