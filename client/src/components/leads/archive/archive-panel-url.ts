"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const PANEL_TAB_PARAM = "lid_tab";
export type PanelTab = "malumot" | "izohlar" | "tarix";

const TABS: PanelTab[] = ["malumot", "izohlar", "tarix"];

/** An unknown `?lid_tab=` falls back to the first tab. */
export const panelTab = (raw: string | null): PanelTab =>
  TABS.find((t) => t === raw) ?? "malumot";

/**
 * The side panel's own tab param and its one close path: closing removes BOTH
 * `lid` and `lid_tab`, so neither lingers in the URL while the panel is shut.
 */
export function useArchivePanelUrl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const replace = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "malumot") params.delete(PANEL_TAB_PARAM);
      else params.set(PANEL_TAB_PARAM, value);
      replace(params);
    },
    [replace, searchParams],
  );

  /** `extra` sets (or, with null, removes) other params in the same replace. */
  const close = useCallback(
    (extra?: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("lid");
      params.delete(PANEL_TAB_PARAM);
      for (const [k, v] of Object.entries(extra ?? {})) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      replace(params);
    },
    [replace, searchParams],
  );

  return {
    tab: panelTab(searchParams.get(PANEL_TAB_PARAM)),
    setTab,
    close,
  };
}
