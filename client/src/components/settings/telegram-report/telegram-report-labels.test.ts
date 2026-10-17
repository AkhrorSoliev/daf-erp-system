import { describe, expect, it } from "vitest";
import { SECTIONS, SEND_TIMES } from "./telegram-report-labels";

describe("telegram report labels", () => {
  it("offers 07:00–23:30 in half hours", () => {
    expect(SEND_TIMES[0]).toBe("07:00");
    expect(SEND_TIMES.at(-1)).toBe("23:30");
    expect(SEND_TIMES).toHaveLength(34);
    expect(SEND_TIMES).toContain("21:00");
  });

  it("knows all eight sections, four of them money", () => {
    expect(SECTIONS).toHaveLength(8);
    expect(SECTIONS.filter((s) => s.money).map((s) => s.value)).toEqual(["TODAY_MONEY", "DEBT", "MONTH", "SALARY"]);
  });
});
