import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { METHOD_FILTER, PART_FILTER, periodTitle, receiptText, receivedByText, selectedLine, shortMln } from "./payments-format";

const p = formatPrice;

describe("shortMln", () => {
  it("one decimal from a million, the full figure below", () => {
    expect(shortMln(12_345_678)).toBe("12.3 mln");
    expect(shortMln(1_000_000)).toBe("1.0 mln");
    expect(shortMln(950_000)).toBe(p(950_000));
    expect(shortMln(0)).toBe(p(0));
  });
});

describe("selectedLine", () => {
  it("count and sum", () =>
    expect(selectedLine({ count: 6, amount: 1_685_714, partAmount: null }, "hammasi", null)).toEqual({ main: `Tanlangan: 6 ta to'lov · ${p(1_685_714)} so'm`, part: null }));
  it("bekor: no sum", () =>
    expect(selectedLine({ count: 2, amount: 0, partAmount: null }, "bekor", null)).toEqual({ main: "Tanlangan: 2 ta bekor qilingan to'lov · summaga qo'shilmaydi", part: null }));
  it("the part line", () =>
    expect(selectedLine({ count: 3, amount: 600_000, partAmount: 150_000 }, "otgan", "Eski qarz")).toEqual({ main: `Tanlangan: 3 ta to'lov · ${p(600_000)} so'm`, part: `shundan Eski qarz: ${p(150_000)} so'm` }));
  it("no part line without a part amount or a label", () => {
    expect(selectedLine({ count: 1, amount: 5, partAmount: null }, "otgan", "Eski qarz").part).toBeNull();
    expect(selectedLine({ count: 1, amount: 5, partAmount: 5 }, "otgan", null).part).toBeNull();
  });
});

describe("receiptText", () => {
  it("code and paper number", () => {
    expect(receiptText({ receiptCode: "R-2026-00001", receiptNumber: "12345" })).toBe("R-2026-00001 · qog'oz № 12345");
    expect(receiptText({ receiptCode: "R-2026-00001", receiptNumber: null })).toBe("R-2026-00001");
    expect(receiptText({ receiptCode: null, receiptNumber: "12345" })).toBe("— · qog'oz № 12345");
    expect(receiptText({ receiptCode: null, receiptNumber: null })).toBe("—");
  });
});

describe("receivedByText", () => {
  const by = (roleLabel: string | null) => ({ id: 10002, firstName: "Ism", lastName: "Familiya", roleLabel });
  it("Onlayn, name with role, name alone, dash", () => {
    expect(receivedByText({ online: true, receivedBy: by("admin") })).toBe("Onlayn");
    expect(receivedByText({ online: false, receivedBy: by("admin") })).toBe("Ism (admin)");
    expect(receivedByText({ online: false, receivedBy: by(null) })).toBe("Ism");
    expect(receivedByText({ online: false, receivedBy: null })).toBe("—");
  });
});

describe("periodTitle", () => {
  it("follows the period", () => {
    expect(periodTitle("bugun", "2026-10-11")).toBe("Bugun tushgan pul");
    expect(periodTitle("kecha", "2026-10-10")).toBe("Kecha tushgan pul");
    expect(periodTitle("hafta", "2026-10-05")).toBe("Shu hafta tushgan pul");
    expect(periodTitle("oy", "2026-09-01")).toBe("Sentabrda tushgan pul");
    expect(periodTitle("otgan-oy", "2026-09-01")).toBe("Sentabrda tushgan pul");
    expect(periodTitle("oraliq", "2026-09-01")).toBe("Tanlangan oraliqda tushgan pul");
  });
});

describe("filter lists", () => {
  it("part and method options", () => {
    expect(PART_FILTER.qarz).toEqual({ kind: "LATE", label: "Eski qarz" });
    expect(PART_FILTER.joriy.kind).toBe("CURRENT");
    expect(PART_FILTER.oldindan.kind).toBe("ADVANCE");
    expect(METHOD_FILTER.map((m) => m.label)).toEqual(["Naqd", "Click", "Payme", "O'tkazma", "Uzum"]);
    expect(METHOD_FILTER.map((m) => m.value)).toEqual(["CASH", "CLICK", "PAYME", "TRANSFER", "UZUM"]);
  });
});
