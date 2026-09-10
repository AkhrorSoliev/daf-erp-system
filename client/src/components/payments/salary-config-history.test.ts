import { describe, expect, it } from "vitest";
import {
  currentVersionFor,
  effectivePeriodLabel,
  groupVersionsByConfig,
  type SalaryConfigVersion,
} from "./salary-config-history";

/**
 * Two server-side facts drive every expectation here.
 *
 * 1. `effectiveFrom` / `effectiveTo` are Tashkent midnights stored as UTC
 *    instants (`parseTashkentDateStart`), so 01.06.2026 arrives as
 *    `2026-05-31T19:00:00Z`. Formatting in browser-local time would print
 *    31.05.2026 for anyone west of Tashkent — the fixtures use the real wire
 *    shape so that mistake fails the test instead of shipping.
 * 2. `effectiveTo` is EXCLUSIVE — `upsertNewVersion` closes the old version by
 *    setting it to the NEW version's start. The label must therefore end a
 *    closed version on the day BEFORE `effectiveTo`, or it claims a rate was
 *    in force on a day it had already been replaced.
 */

/** Tashkent midnight of `YYYY-MM-DD`, as the server would store it. */
const tashkent = (day: string) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() - 5 * 3600 * 1000).toISOString();

const version = (
  over: Partial<SalaryConfigVersion> & { id: string },
): SalaryConfigVersion => ({
  configId: "cfg-umumiy",
  salaryType: "PERCENTAGE",
  value: 30,
  effectiveFrom: tashkent("2026-06-01"),
  effectiveTo: null,
  createdAt: "2026-06-01T09:00:00.000Z",
  config: { groupId: null, group: null },
  changedBy: null,
  ...over,
});

describe("currentVersionFor", () => {
  it("returns the version that is still open for that config", () => {
    const versions = [
      version({ id: "v2", effectiveFrom: tashkent("2026-08-01"), value: 35 }),
      version({
        id: "v1",
        effectiveFrom: tashkent("2026-06-01"),
        effectiveTo: tashkent("2026-08-01"),
        value: 30,
      }),
    ];

    expect(currentVersionFor("cfg-umumiy", versions)?.id).toBe("v2");
  });

  it("ignores versions belonging to another config", () => {
    const versions = [
      version({ id: "guruh", configId: "cfg-guruh", value: 40 }),
      version({ id: "umumiy", configId: "cfg-umumiy", value: 30 }),
    ];

    expect(currentVersionFor("cfg-guruh", versions)?.value).toBe(40);
  });

  it("returns null when every version for the config is already closed", () => {
    const versions = [version({ id: "v1", effectiveTo: tashkent("2026-08-01") })];

    expect(currentVersionFor("cfg-umumiy", versions)).toBeNull();
  });

  it("picks the latest start when more than one version is left open", () => {
    const versions = [
      version({ id: "eski", effectiveFrom: tashkent("2026-06-01") }),
      version({ id: "yangi", effectiveFrom: tashkent("2026-08-01") }),
    ];

    expect(currentVersionFor("cfg-umumiy", versions)?.id).toBe("yangi");
  });
});

describe("effectivePeriodLabel", () => {
  it("reads an open version as running from its start until now", () => {
    const v = version({ id: "v", effectiveFrom: tashkent("2026-08-01") });

    expect(effectivePeriodLabel(v)).toBe("01.08.2026 dan hozirgacha");
  });

  it("ends a closed version the day before effectiveTo, not on it", () => {
    const v = version({
      id: "v",
      effectiveFrom: tashkent("2026-06-01"),
      effectiveTo: tashkent("2026-08-01"),
    });

    expect(effectivePeriodLabel(v)).toBe("01.06.2026 – 31.07.2026");
  });

  it("shows a single day when a version was replaced the day after it started", () => {
    const v = version({
      id: "v",
      effectiveFrom: tashkent("2026-06-01"),
      effectiveTo: tashkent("2026-06-02"),
    });

    expect(effectivePeriodLabel(v)).toBe("01.06.2026 – 01.06.2026");
  });

  it("marks a version that was replaced before it ever applied", () => {
    const v = version({
      id: "v",
      effectiveFrom: tashkent("2026-06-01"),
      effectiveTo: tashkent("2026-06-01"),
    });

    expect(effectivePeriodLabel(v)).toBe("01.06.2026 — amal qilmagan");
  });

  it("names the Tashkent day even when the reader's browser is hours behind", () => {
    // 01.09.2026 Tashkent == 2026-08-31T19:00Z. A browser-local formatter in
    // UTC-or-west prints 31.08.2026 — a whole month off at a month boundary.
    const v = version({ id: "v", effectiveFrom: tashkent("2026-09-01") });

    expect(effectivePeriodLabel(v)).toBe("01.09.2026 dan hozirgacha");
  });
});

describe("groupVersionsByConfig", () => {
  it("keeps each config's versions apart so a group rate is not mixed with the general one", () => {
    const versions = [
      version({
        id: "g1",
        configId: "cfg-guruh",
        value: 40,
        config: { groupId: "g", group: { id: "g", name: "A1-kechki" } },
      }),
      version({ id: "u1", configId: "cfg-umumiy", value: 30 }),
    ];

    const groups = groupVersionsByConfig(versions);

    expect(groups.map((g) => g.configId)).toEqual(["cfg-umumiy", "cfg-guruh"]);
    expect(groups[0].versions.map((v) => v.id)).toEqual(["u1"]);
    expect(groups[1].versions.map((v) => v.id)).toEqual(["g1"]);
  });

  it("puts the general rate first and then the group rates by name", () => {
    const versions = [
      version({
        id: "b",
        configId: "cfg-b",
        config: { groupId: "b", group: { id: "b", name: "B-guruh" } },
      }),
      version({
        id: "a",
        configId: "cfg-a",
        config: { groupId: "a", group: { id: "a", name: "A-guruh" } },
      }),
      version({ id: "umumiy", configId: "cfg-umumiy" }),
    ];

    expect(groupVersionsByConfig(versions).map((g) => g.label)).toEqual([
      "Umumiy",
      "A-guruh",
      "B-guruh",
    ]);
  });

  it("orders each config's versions newest first", () => {
    const versions = [
      version({
        id: "eski",
        effectiveFrom: tashkent("2026-06-01"),
        effectiveTo: tashkent("2026-08-01"),
      }),
      version({ id: "yangi", effectiveFrom: tashkent("2026-08-01") }),
    ];

    const [group] = groupVersionsByConfig(versions);

    expect(group.versions.map((v) => v.id)).toEqual(["yangi", "eski"]);
  });

  it("returns nothing for an employee who never had a rate", () => {
    expect(groupVersionsByConfig([])).toEqual([]);
  });
});
