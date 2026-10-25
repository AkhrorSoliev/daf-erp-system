import { describe, expect, it } from "vitest";
import {
  currentRate,
  mergeRateRow,
  percentInput,
  rowError,
  tiersError,
  toRatePayload,
  toTierPayload,
} from "./tax-settings-draft";

describe("tax settings draft", () => {
  it("validates a rate row", () => {
    expect(rowError({ fromMonth: "2026-10", value: "2.5" })).toBeNull();
    expect(rowError({ fromMonth: "", value: "2" })).toBe("Oyni tanlang");
    expect(rowError({ fromMonth: "2026-10", value: "" })).toBe("Foiz 0 dan 100 gacha");
    expect(rowError({ fromMonth: "2026-10", value: "101" })).toBe("Foiz 0 dan 100 gacha");
    expect(rowError({ fromMonth: "2026-10", value: "2.555" })).toBe("Ko'pi bilan 2 kasr");
    expect(rowError({ fromMonth: "2026-10", value: "0.001" })).toBe("Ko'pi bilan 2 kasr");
  });

  it("accepts valid 2-decimal percents that float math would reject", () => {
    for (const v of ["1.15", "0.07", "4.35", "100", "0"]) {
      expect(rowError({ fromMonth: "2026-10", value: v }), v).toBeNull();
    }
  });

  it("validates tiers", () => {
    expect(tiersError([{ fromAmount: "0", toAmount: "", percent: "0.1" }])).toBeNull();
    expect(tiersError([])).toBe("Kamida bitta oraliq kiriting");
    expect(tiersError([{ fromAmount: "5", toAmount: "", percent: "0.1" }])).toBe("1-oraliq 0 dan boshlanadi");
    expect(tiersError([{ fromAmount: "0", toAmount: "100", percent: "0.1" }])).toBe(
      "Oxirgi oraliqning yuqori chegarasi bo'sh qoladi",
    );
    expect(
      tiersError([
        { fromAmount: "0", toAmount: "100", percent: "1" },
        { fromAmount: "120", toAmount: "", percent: "1" },
      ]),
    ).toBe("Oraliqlar orasida bo'shliq bor");
    expect(
      tiersError([
        { fromAmount: "0", toAmount: "100", percent: "1.15" },
        { fromAmount: "100", toAmount: "", percent: "0.07" },
      ]),
    ).toBeNull();
  });

  it("builds payloads and reads the current rate", () => {
    expect(toRatePayload([{ fromMonth: "2026-10", value: "4" }])).toEqual([{ fromMonth: "2026-10", value: 4 }]);
    expect(
      toTierPayload("2026-10", [
        { fromAmount: "0", toAmount: "100", percent: "1" },
        { fromAmount: "100", toAmount: "", percent: "0.5" },
      ]),
    ).toEqual({
      fromMonth: "2026-10",
      tiers: [
        { fromAmount: 0, toAmount: 100, percent: 1 },
        { fromAmount: 100, toAmount: null, percent: 0.5 },
      ],
    });
    expect(currentRate([{ fromMonth: "2026-10", value: 4 }, { fromMonth: "2027-01", value: 6 }], "2026-12")).toBe(4);
    expect(currentRate([], "2026-12")).toBeNull();
  });

  it("cleans a percent field while typing", () => {
    expect(percentInput("1,15")).toBe("1.15");
    expect(percentInput("4a.5.6")).toBe("4.56");
    expect(percentInput("")).toBe("");
  });

  it("appends a new month, replaces the same month, keeps the others sorted", () => {
    const list = [{ fromMonth: "2026-10", value: 4 }];
    expect(mergeRateRow(list, { fromMonth: "2026-07", value: 3 })).toEqual([
      { fromMonth: "2026-07", value: 3 },
      { fromMonth: "2026-10", value: 4 },
    ]);
    expect(mergeRateRow(list, { fromMonth: "2026-10", value: 5 })).toEqual([{ fromMonth: "2026-10", value: 5 }]);
  });
});
