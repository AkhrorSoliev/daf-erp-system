import { describe, expect, it } from "vitest";
import { parseStatsPeriod, topSourcesLine } from "./lead-stats";
import { leadHolatiParams } from "./lead-filter-schema";
import {
  UNCALLED_HOLATI,
  cardFilters,
  uncalledCardActive,
} from "./lead-stats";

describe("parseStatsPeriod", () => {
  it("keeps the three periods", () => {
    expect(parseStatsPeriod("week")).toBe("week");
    expect(parseStatsPeriod("last-month")).toBe("last-month");
  });

  it("reads anything else as the current month", () => {
    expect(parseStatsPeriod("")).toBe("month");
    expect(parseStatsPeriod("year")).toBe("month");
  });
});

describe("UNCALLED_HOLATI", () => {
  it("asks the list for new leads nobody has called", () => {
    expect(leadHolatiParams(UNCALLED_HOLATI)).toEqual({
      status: "NEW",
      called: "false",
    });
  });
});

describe("topSourcesLine", () => {
  it("joins name and count", () => {
    expect(
      topSourcesLine([
        { name: "Tanishlar", count: 70 },
        { name: "Instagram", count: 37 },
      ]),
    ).toBe("Tanishlar 70 · Instagram 37");
  });

  it("is null with no sources", () => {
    expect(topSourcesLine([])).toBeNull();
  });
});

describe("cardFilters", () => {
  it("clears every other filter so the list holds the card's leads", () => {
    expect(cardFilters("created")).toMatchObject({
      search: "",
      holati: [],
      sourceId: [],
      masul: [],
      startDate: "",
      karta: "created",
      page: 1,
    });
  });

  it("opens the board, the uncalled list or a period card", () => {
    expect(cardFilters("onBoard")).toMatchObject({ karta: "", holati: [] });
    expect(cardFilters("uncalled")).toMatchObject({
      karta: "",
      holati: UNCALLED_HOLATI,
    });
    expect(cardFilters("lost").karta).toBe("lost");
  });
});

describe("uncalledCardActive", () => {
  const list = { ...cardFilters("uncalled"), pageSize: 10 };

  it("is on for exactly the card's list, in either token order", () => {
    expect(uncalledCardActive(list)).toBe(true);
    expect(
      uncalledCardActive({ ...list, holati: [...UNCALLED_HOLATI].reverse() }),
    ).toBe(true);
  });

  it("is off once another filter narrows the list", () => {
    expect(uncalledCardActive({ ...list, search: "Ali" })).toBe(false);
    expect(uncalledCardActive({ ...list, holati: ["NEW"] })).toBe(false);
    expect(uncalledCardActive({ ...cardFilters("onBoard"), pageSize: 10 })).toBe(
      false,
    );
  });
});
