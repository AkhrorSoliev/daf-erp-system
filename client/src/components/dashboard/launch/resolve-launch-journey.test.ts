import { describe, expect, it } from "vitest";
import type { ReadinessCheck, ReadinessKey } from "./launch-types";
import { resolveLaunchJourney } from "./resolve-launch-journey";

const c = (
  key: ReadinessKey,
  ok: boolean,
  extra: Partial<ReadinessCheck> = {},
): ReadinessCheck => ({ key, label: key, ok, required: true, hint: `${key}-hint`, ...extra });

const STATION_KEYS: ReadinessKey[] = [
  "workingHours",
  "room",
  "course",
  "teachers",
  "teacherRates",
  "group",
  "enrollment",
  "payment",
];

describe("resolveLaunchJourney", () => {
  it("8 stations in a strict order", () => {
    const j = resolveLaunchJourney([]);
    expect(j.stations.map((s) => s.station.key)).toEqual(STATION_KEYS);
    expect(j.total).toBe(8);
  });

  it("current — the first not-done station in order", () => {
    const j = resolveLaunchJourney([
      c("workingHours", true),
      c("room", true),
      c("course", false),
      c("teachers", false),
    ]);
    expect(j.stations.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(j.current?.station.key).toBe("course");
    expect(j.doneCount).toBe(2);
  });

  it("no lock: a later station is still done even if finished early", () => {
    const j = resolveLaunchJourney([c("workingHours", false), c("enrollment", true)]);
    expect(j.stations.find((s) => s.station.key === "enrollment")?.state).toBe("done");
    expect(j.current?.station.key).toBe("workingHours");
  });

  it("a key missing from the server counts as not done", () => {
    const j = resolveLaunchJourney([c("workingHours", true)]);
    expect(j.stations.find((s) => s.station.key === "payment")?.state).toBe("todo");
  });

  it("hint and names come from the server", () => {
    const j = resolveLaunchJourney([
      c("teacherRates", false, {
        hint: "1 ta ustozga stavka qo'yilmagan",
        details: [{ id: 1, name: "Ali Valiyev" }],
      }),
    ]);
    const rates = j.stations.find((s) => s.station.key === "teacherRates")!;
    expect(rates.hint).toBe("1 ta ustozga stavka qo'yilmagan");
    expect(rates.details).toEqual([{ id: 1, name: "Ali Valiyev" }]);
  });

  it("all three extras stand alone, each with its own status", () => {
    const j = resolveLaunchJourney([
      c("administrator", true, { required: false }),
      c("leadSection", false, { required: false }),
    ]);
    expect(j.extras.map((x) => [x.station.key, x.ok])).toEqual([
      ["administrator", true],
      ["leadSection", false],
      ["telegramGroup", false],
    ]);
  });

  it("everything done — no current station", () => {
    const j = resolveLaunchJourney(STATION_KEYS.map((k) => c(k, true)));
    expect(j.current).toBeNull();
    expect(j.doneCount).toBe(8);
  });
});
