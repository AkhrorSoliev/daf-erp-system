import { describe, expect, it } from "vitest";
import { formatWeekdays } from "./weekdays";

describe("formatWeekdays", () => {
  it("sorts Monday to Saturday and keeps the Uzbek short names by default", () => {
    expect(formatWeekdays(["friday", "MONDAY", "wednesday"])).toBe("Du, Chor, Ju");
  });

  it("draws each short name through the translator it is given", () => {
    const ru: Record<string, string> = { Du: "Пн", Chor: "Ср", Ju: "Пт" };
    expect(formatWeekdays(["friday", "monday", "wednesday"], (s) => ru[s] ?? s)).toBe("Пн, Ср, Пт");
  });

  it("passes an unknown day through untouched", () => {
    expect(formatWeekdays(["sunday"], (s) => `!${s}`)).toBe("sunday");
  });
});
