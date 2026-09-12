import { describe, expect, it } from "vitest";
import { formatVaqt } from "./pleyer-vaqt";

describe("formatVaqt", () => {
  it("soniyani m:ss ko'rinishida beradi", () => {
    expect(formatVaqt(0)).toBe("0:00");
    expect(formatVaqt(5)).toBe("0:05");
    expect(formatVaqt(65)).toBe("1:05");
    expect(formatVaqt(600)).toBe("10:00");
  });

  it("kasrni pastga yaxlitlaydi", () => {
    expect(formatVaqt(41.9)).toBe("0:41");
  });

  it("NaN va Infinity (metadata hali yuklanmagan) — 0:00", () => {
    // `<audio>.duration` metadata kelguncha NaN; pleyer «NaN:NaN» chizmasin.
    expect(formatVaqt(Number.NaN)).toBe("0:00");
    expect(formatVaqt(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});
