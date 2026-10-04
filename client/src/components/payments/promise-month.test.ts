import { describe, expect, it } from "vitest";
import { capToRange, dateFromDay, paymentPromiseAsk } from "./promise-month";
import type { PromiseMonthState } from "./debt/debt-types";

const CREATE = { from: "2026-10-14", to: "2026-10-21" };
const EDIT = { from: "2026-10-14", to: "2026-10-16" };
const promise = (status: string) => ({ id: "p1", status, promiseDate: "2026-10-05T18:00:00Z", promisedAmount: null, createdAt: "2026-10-02T05:00:00Z" });
const loaded = (data: PromiseMonthState) => ({ data, isError: false });

describe("the payment dialog's promise question (ADR-0072)", () => {
  it("a full payment asks nothing", () => {
    expect(paymentPromiseAsk(false, loaded({ monthPromise: null, create: CREATE, edit: null }))).toEqual({ needsPromise: false, range: CREATE, hint: null });
  });

  it("a part payment asks for the month's first promise, or moves its OPEN one", () => {
    expect(paymentPromiseAsk(true, loaded({ monthPromise: null, create: CREATE, edit: null }))).toEqual({ needsPromise: true, range: CREATE, hint: null });
    expect(paymentPromiseAsk(true, loaded({ monthPromise: promise("OPEN"), create: null, edit: EDIT }))).toEqual({ needsPromise: true, range: EDIT, hint: null });
  });

  it("a closed month's promise: no date asked, and the reason", () => {
    expect(paymentPromiseAsk(true, loaded({ monthPromise: promise("KEPT"), create: null, edit: null })))
      .toEqual({ needsPromise: false, range: null, hint: "Shu oy va'da yozilgan: 05.10 gacha. Yangisi so'ralmaydi." });
  });

  it("a failed lookup never blocks the payment: no date asked, and the reason", () => {
    expect(paymentPromiseAsk(true, { data: undefined, isError: true }))
      .toEqual({ needsPromise: false, range: null, hint: "Va'da holatini yuklab bo'lmadi — sana so'ralmaydi." });
  });

  it("while loading the date is still asked (submit waits for the range)", () => {
    expect(paymentPromiseAsk(true, { data: undefined, isError: false })).toEqual({ needsPromise: true, range: null, hint: null });
  });
});

describe("promise date helpers (ADR-0072)", () => {
  it("a day is local midnight, the value a DatePicker bound takes", () => {
    expect(dateFromDay("2026-10-21")).toEqual(new Date(2026, 9, 21));
  });

  it("a default day is clamped into the allowed range", () => {
    const range = { from: "2026-10-14", to: "2026-10-21" };
    expect(capToRange(new Date(2026, 10, 2), range)).toEqual(new Date(2026, 9, 21));
    expect(capToRange(new Date(2026, 9, 10), range)).toEqual(new Date(2026, 9, 14));
    expect(capToRange(new Date(2026, 9, 16), range)).toEqual(new Date(2026, 9, 16));
    expect(capToRange(null, range)).toBeNull();
    expect(capToRange(new Date(2026, 10, 2), null)).toEqual(new Date(2026, 10, 2));
  });
});
