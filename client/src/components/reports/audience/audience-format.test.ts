import { describe, expect, it } from "vitest";
import { ageText, barWidth, coverageText, pctText } from "./audience-format";

describe("audience format", () => {
  it("prints a dash, never 0%, for a share the server left out", () => {
    expect(pctText(null)).toBe("—");
    expect(pctText(0)).toBe("0%");
    expect(pctText(80)).toBe("80%");
  });

  it("prints the average age with a decimal comma, or a dash", () => {
    expect(ageText(19.8)).toBe("19,8");
    expect(ageText(20)).toBe("20,0");
    expect(ageText(null)).toBe("—");
  });

  it("says how much of the page a figure stands on", () => {
    expect(coverageText(197, 516)).toMatch(/^197 \/ 516 \(38%\)$/);
    expect(coverageText(0, 0)).toMatch(/\(0%\)$/);
  });

  it("an unknown share draws an empty bar", () => {
    expect(barWidth(null)).toBe("0%");
    expect(barWidth(34)).toBe("34%");
  });
});
