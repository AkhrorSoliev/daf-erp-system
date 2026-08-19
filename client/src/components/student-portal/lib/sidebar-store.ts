import { create } from "zustand";

/**
 * Width of the portal side rail on tablet + desktop (>= md).
 *
 * `auto` is a pre-hydration state, never a state the student picks. It renders
 * as a pure-CSS default — narrow at md, wide at lg — so the server markup and
 * the first client paint agree and nothing flashes. `resolve()` runs once on
 * mount and replaces it with the stored choice, or, for a student who has never
 * touched the toggle, with the width their screen implies.
 *
 * After that the mode is explicit and does NOT re-derive from the viewport: a
 * deliberate toggle should survive turning a tablet sideways or dragging a
 * browser window narrower.
 */
export type SidebarMode = "auto" | "collapsed" | "expanded";

const STORAGE_KEY = "daf.portal.sidebar";
/** Matches Tailwind's `lg` — above it a rail wide enough for labels fits. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function isMode(value: unknown): value is SidebarMode {
  return value === "auto" || value === "collapsed" || value === "expanded";
}

interface SidebarState {
  mode: SidebarMode;
  /** Called once by the portal shell on mount. Idempotent. */
  resolve: () => void;
  toggle: () => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  mode: "auto",

  resolve: () => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode / blocked storage — fall through to the viewport default.
    }
    const next: SidebarMode =
      isMode(stored) && stored !== "auto"
        ? stored
        : window.matchMedia(DESKTOP_QUERY).matches
          ? "expanded"
          : "collapsed";
    if (next !== get().mode) set({ mode: next });
  },

  toggle: () => {
    const next: SidebarMode =
      get().mode === "collapsed" ? "expanded" : "collapsed";
    set({ mode: next });
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  },
}));

/**
 * The three pieces of chrome whose geometry depends on the rail must agree on
 * its width, so the class fragments live here rather than being retyped in each
 * component. 72px collapsed / 240px expanded; the player clears the rail by
 * 16px.
 */
export const RAIL_WIDTH: Record<SidebarMode, string> = {
  auto: "md:w-[72px] lg:w-[240px]",
  collapsed: "md:w-[72px]",
  expanded: "md:w-[240px]",
};

export const CONTENT_INSET: Record<SidebarMode, string> = {
  auto: "md:pl-[72px] lg:pl-[240px]",
  collapsed: "md:pl-[72px]",
  expanded: "md:pl-[240px]",
};

export const PLAYER_INSET: Record<SidebarMode, string> = {
  auto: "md:left-[88px] lg:left-[256px]",
  collapsed: "md:left-[88px]",
  expanded: "md:left-[256px]",
};
