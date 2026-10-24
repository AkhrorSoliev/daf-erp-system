import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { averageText, barPercent, commentStateLabel, isLongComment, responseText, trend } from "./rating-format";

describe("averageText", () => {
  it("shows one decimal with a star, or a dash", () => {
    expect(averageText(4.6)).toBe("4,6 ⭐");
    expect(averageText(5)).toBe("5,0 ⭐");
    expect(averageText(null)).toBe("—");
  });
});

describe("trend", () => {
  it("compares with last month", () => {
    expect(trend(4.6, 4.4)).toEqual({ text: "↑ 0,2", tone: "up" });
    expect(trend(4.1, 4.4)).toEqual({ text: "↓ 0,3", tone: "down" });
    expect(trend(4.4, 4.4)).toEqual({ text: "o'zgarmadi", tone: "same" });
    expect(trend(4.4, null)).toBeNull();
    expect(trend(null, 4.4)).toBeNull();
  });
});

describe("responseText", () => {
  it("says rated of delivered with the share", () => {
    expect(responseText(255, 340, 75)).toBe("255 / 340 · 75%");
    expect(responseText(0, 0, null)).toBe("—");
    expect(responseText(1, 4, 76.5)).toBe("1 / 4 · 76,5%");
    expect(responseText(1200, 1500, 80)).toBe(`${formatNumber(1200)} / ${formatNumber(1500)} · 80%`);
  });
});

describe("barPercent", () => {
  it("is empty without a maximum", () => {
    expect(barPercent(0, 0)).toBe("0%");
    expect(barPercent(3, 0)).toBe("0%");
  });

  it("makes the biggest bar full width", () => {
    expect(barPercent(8, 8)).toBe("100%");
    expect(barPercent(4, 8)).toBe("50%");
    expect(barPercent(0, 8)).toBe("0%");
  });

  it("rounds to a whole percent", () => {
    expect(barPercent(1, 3)).toBe("33%");
    expect(barPercent(2, 3)).toBe("67%");
  });
});

describe("isLongComment", () => {
  it("is long only above the limit", () => {
    expect(isLongComment("a".repeat(140))).toBe(false);
    expect(isLongComment("a".repeat(141))).toBe(true);
    expect(isLongComment("abcdef", 5)).toBe(true);
  });
});

describe("commentStateLabel", () => {
  it("names the three states", () => {
    expect(commentStateLabel("WRITTEN")).toEqual({ text: "Yozdi", tone: "green" });
    expect(commentStateLabel("NOT_WRITTEN")).toEqual({ text: "Yozmadi", tone: "muted" });
    expect(commentStateLabel("PENDING")).toEqual({ text: "Izoh kutilmoqda", tone: "amber" });
  });
});
