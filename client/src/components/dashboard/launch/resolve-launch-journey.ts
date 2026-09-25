import { LAUNCH_EXTRAS, LAUNCH_STATIONS, type LaunchStation } from "./launch-stations";
import type { ReadinessCheck, ReadinessKey } from "./launch-types";

export type StationState = "done" | "current" | "todo";

export interface JourneyStation {
  station: LaunchStation;
  state: StationState;
  hint: string;
  details: { id: number; name: string; ceoOnly?: boolean }[];
}

export interface JourneyExtra {
  station: LaunchStation;
  ok: boolean;
  hint: string;
}

export interface LaunchJourney {
  stations: JourneyStation[];
  extras: JourneyExtra[];
  doneCount: number;
  total: number;
  current: JourneyStation | null;
}

/**
 * Server checks → the journey map. "Current" is the first not-done station in
 * order; there is no lock, order is only a suggestion (a student can be added
 * without a group too). A key missing from the server is treated as not done
 * — so an old server never silently reads as "done".
 */
export function resolveLaunchJourney(checks: ReadinessCheck[]): LaunchJourney {
  const byKey = new Map<ReadinessKey, ReadinessCheck>(checks.map((c) => [c.key, c]));
  let currentTaken = false;

  const stations = LAUNCH_STATIONS.map((station): JourneyStation => {
    const check = byKey.get(station.key);
    const ok = check?.ok ?? false;
    let state: StationState = ok ? "done" : "todo";
    if (!ok && !currentTaken) {
      state = "current";
      currentTaken = true;
    }
    return { station, state, hint: check?.hint ?? "", details: check?.details ?? [] };
  });

  const extras = LAUNCH_EXTRAS.map((station): JourneyExtra => {
    const check = byKey.get(station.key);
    return { station, ok: check?.ok ?? false, hint: check?.hint ?? "" };
  });

  return {
    stations,
    extras,
    doneCount: stations.filter((s) => s.state === "done").length,
    total: stations.length,
    current: stations.find((s) => s.state === "current") ?? null,
  };
}
