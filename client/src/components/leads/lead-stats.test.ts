import { describe, expect, it } from "vitest";
import { parseStatsPeriod, topSourcesLine } from "./lead-stats";
import { leadHolatiParams } from "./lead-filter-schema";
import { UNCALLED_HOLATI } from "./lead-stats";

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
