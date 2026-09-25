import { create } from "zustand";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

/** One highlight: on which page, which button, and what explanation. */
export interface SpotlightStep {
  /** Only searched for on this page (compared against the PATH of `usePathname()`). */
  route: string;
  /** `data-tour` candidates — the first one found is highlighted. */
  targets: string[];
  title: string;
  body: string;
}

interface SpotlightState {
  step: SpotlightStep | null;
  /** Bumped on every `start` — the `key` the renderer uses to start a new tour from scratch. */
  seq: number;
  start: (step: SpotlightStep) => void;
  stop: () => void;
}

export const useSpotlight = create<SpotlightState>((set) => ({
  step: null,
  seq: 0,
  start: (step) => set((s) => ({ step, seq: s.seq + 1 })),
  stop: () => set({ step: null }),
}));

// On a branch switch, an open tour must not stay stuck on another branch's page.
registerBranchScopedStore(useSpotlight);
