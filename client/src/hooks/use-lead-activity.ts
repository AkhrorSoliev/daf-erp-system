import { create } from "zustand";
import api from "@/lib/api";

/**
 * Lazy, cached hover preview for lead board cards. The board/section load never
 * fetches this — only an actual hover does, via `fetchSummary`. Once a lead's
 * summary is cached it is never re-fetched while the page lives (re-hovering is
 * free). Mutations that change the data (a new comment, a call toggle) call
 * `invalidate` so the next hover pulls a fresh copy.
 */

export interface LeadActivitySummary {
  calledAt: string | null;
  calledBy: { id: number; name: string } | null;
  latestComment: {
    authorName: string;
    content: string;
    createdAt: string;
    isTask: boolean;
  } | null;
}

interface LeadActivityState {
  summaries: Record<string, LeadActivitySummary>;
  loading: Record<string, boolean>;
  errored: Record<string, boolean>;
  /**
   * Monotonic per-lead token bumped by `invalidate`. A fetch captures it when it
   * starts and only commits if it still matches on resolve — so a request that
   * was in flight when an invalidation landed can never write stale data back.
   */
  generation: Record<string, number>;
  /** Fires at most one request per lead; a no-op when cached or in flight. */
  fetchSummary: (leadId: string) => void;
  /** Drops the cached copy so the next hover re-fetches. */
  invalidate: (leadId: string) => void;
}

export const useLeadActivity = create<LeadActivityState>((set, get) => ({
  summaries: {},
  loading: {},
  errored: {},
  generation: {},

  fetchSummary: (leadId) => {
    const { summaries, loading, generation } = get();
    // Already cached or already being fetched → never hit the backend again.
    if (summaries[leadId] !== undefined || loading[leadId]) return;

    const gen = generation[leadId] ?? 0;

    set((s) => ({
      loading: { ...s.loading, [leadId]: true },
      errored: { ...s.errored, [leadId]: false },
    }));

    api
      .get<LeadActivitySummary>(`/leads/${leadId}/hover-summary`)
      .then(({ data }) => {
        // Discard if an invalidation happened while this request was in flight
        // (the data we fetched is now known to be stale).
        if ((get().generation[leadId] ?? 0) !== gen) return;
        set((s) => ({
          summaries: { ...s.summaries, [leadId]: data },
          loading: { ...s.loading, [leadId]: false },
        }));
      })
      .catch(() => {
        if ((get().generation[leadId] ?? 0) !== gen) return;
        // Leave it uncached (so a later hover may retry) but flag the error so
        // the tooltip can show a message instead of a perpetual spinner.
        set((s) => ({
          loading: { ...s.loading, [leadId]: false },
          errored: { ...s.errored, [leadId]: true },
        }));
      });
  },

  invalidate: (leadId) => {
    set((s) => {
      const summaries = { ...s.summaries };
      delete summaries[leadId];
      const errored = { ...s.errored };
      delete errored[leadId];
      // Clear any in-flight flag so a fresh hover can immediately re-issue, and
      // bump the generation so the old in-flight response (if any) is ignored.
      const loading = { ...s.loading };
      delete loading[leadId];
      return {
        summaries,
        errored,
        loading,
        generation: {
          ...s.generation,
          [leadId]: (s.generation[leadId] ?? 0) + 1,
        },
      };
    });
  },
}));
