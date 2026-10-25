import { describe, expect, it } from "vitest";
import { pctText, shareText, unknownCount } from "./audience-format";

describe("audience format", () => {
  it("prints a dash, never 0%, for a share the server left out", () => {
    expect(pctText(null)).toBe("—");
    expect(pctText(0)).toBe("0%");
    expect(pctText(80)).toBe("80%");
  });

  it("rounds a share of two counts, and prints a dash when there is nobody", () => {
    expect(shareText(197, 516)).toBe("38%");
    expect(shareText(0, 12)).toBe("0%");
    expect(shareText(0, 0)).toBe("—");
  });

  it("counts the unknown as the rest, never below zero", () => {
    expect(unknownCount(516, 197)).toBe(319);
    expect(unknownCount(5, 9)).toBe(0);
  });
});
