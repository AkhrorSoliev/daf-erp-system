import { describe, expect, it } from "vitest";
import {
  archivePageSize,
  archiveParams,
  archiveTab,
  dateToDay,
  dayToDate,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive-url";

const empty: ArchiveFilters = {
  tab: "lidlar",
  q: "",
  kim: [],
  dan: "",
  gacha: "",
  sahifa: 1,
  soni: 10,
};

describe("archiveParams", () => {
  it("sends only paging when nothing is filtered", () => {
    expect(archiveParams(empty)).toEqual({
      page: 1,
      pageSize: 10,
      search: undefined,
      deletedById: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("sends filters under the server's names; the user list is comma-joined", () => {
    expect(
      archiveParams({
        ...empty,
        q: " aziz ",
        kim: ["5", "9"],
        dan: "2026-10-01",
        gacha: "2026-10-31",
        sahifa: 3,
        soni: 20,
      }),
    ).toEqual({
      page: 3,
      pageSize: 20,
      search: "aziz",
      deletedById: "5,9",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("falls back to 10 for a page size the page does not offer", () => {
    expect(archivePageSize(99)).toBe(10);
    expect(archivePageSize(50)).toBe(50);
  });
});

describe("archiveTab", () => {
  it("knows two tabs and defaults to leads", () => {
    expect(archiveTab("bolimlar")).toBe("bolimlar");
    expect(archiveTab("lidlar")).toBe("lidlar");
    expect(archiveTab("zzz")).toBe("lidlar");
  });
});

describe("hasArchiveFilter", () => {
  it("is false for paging and tab alone", () => {
    expect(hasArchiveFilter({ ...empty, tab: "bolimlar", sahifa: 4 })).toBe(false);
    expect(hasArchiveFilter({ ...empty, q: "  " })).toBe(false);
  });
  it("is true for search, people or a date", () => {
    expect(hasArchiveFilter({ ...empty, q: "a" })).toBe(true);
    expect(hasArchiveFilter({ ...empty, kim: ["5"] })).toBe(true);
    expect(hasArchiveFilter({ ...empty, dan: "2026-10-01" })).toBe(true);
    expect(hasArchiveFilter({ ...empty, gacha: "2026-10-01" })).toBe(true);
  });
});

describe("day <-> date", () => {
  it("round-trips a day and tolerates junk", () => {
    expect(dateToDay(dayToDate("2026-10-18"))).toBe("2026-10-18");
    expect(dayToDate("")).toBeUndefined();
    expect(dayToDate("garbage")).toBeUndefined();
    expect(dateToDay(undefined)).toBe("");
  });
});
