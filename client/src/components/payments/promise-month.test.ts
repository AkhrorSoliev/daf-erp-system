import { describe, expect, it } from "vitest";
import { callPromiseAsk, capToRange, dateFromDay, paymentPromiseAsk, PROMISE_MOVE_NOTE } from "./promise-month";
import type { PromiseMonthState } from "./debt/debt-types";

const CREATE = { from: "2026-10-14", to: "2026-10-21" };
const EDIT = { from: "2026-10-14", to: "2026-10-16" };
const promise = (status: string) => ({ id: "p1", status, promiseDate: "2026-10-05T18:00:00Z", promisedAmount: null, createdAt: "2026-10-02T05:00:00Z" });
const loaded = (data: PromiseMonthState) => ({ data, isError: false });
const FAILED = "Va'da holatini yuklab bo'lmadi — sana so'ralmaydi.";

describe("the payment dialog's promise question (ADR-0072)", () => {
  it("a full payment asks nothing", () => {
    expect(paymentPromiseAsk(false, loaded({ monthPromise: null, create: CREATE, edit: null }))).toEqual({ needsPromise: false, range: CREATE, hint: null, movesFrom: null });
  });

  it("a part payment asks for the month's first promise, or moves its OPEN one from its own day", () => {
    expect(paymentPromiseAsk(true, loaded({ monthPromise: null, create: CREATE, edit: null }))).toEqual({ needsPromise: true, range: CREATE, hint: null, movesFrom: null });
    // 23:00 Tashkent on 05.10 → that day, whatever the browser's zone.
    expect(paymentPromiseAsk(true, loaded({ monthPromise: promise("OPEN"), create: null, edit: EDIT }))).toEqual({ needsPromise: true, range: EDIT, hint: null, movesFrom: new Date(2026, 9, 5) });
  });

  it("a closed month's promise: no date asked, and the reason", () => {
    expect(paymentPromiseAsk(true, loaded({ monthPromise: promise("KEPT"), create: null, edit: null })))
      .toEqual({ needsPromise: false, range: null, hint: "Shu oy va'da yozilgan: 05.10 gacha. Yangisi so'ralmaydi.", movesFrom: null });
  });

  it("a failed lookup never blocks the payment: no date asked, and the reason", () => {
    expect(paymentPromiseAsk(true, { data: undefined, isError: true })).toEqual({ needsPromise: false, range: null, hint: FAILED, movesFrom: null });
  });

  it("while loading the date is still asked (submit waits for the range)", () => {
    expect(paymentPromiseAsk(true, { data: undefined, isError: false })).toEqual({ needsPromise: true, range: null, hint: null, movesFrom: null });
  });
});

describe("the call dialog's «To'laydi» (ADR-0072)", () => {
  it("asks for the month's first promise, or moves its OPEN one", () => {
    expect(callPromiseAsk(loaded({ monthPromise: null, create: CREATE, edit: null }))).toEqual({ asksDate: true, range: CREATE, hint: null, moves: false });
    expect(callPromiseAsk(loaded({ monthPromise: promise("OPEN"), create: null, edit: EDIT }))).toEqual({ asksDate: true, range: EDIT, hint: null, moves: true });
  });

  it("a closed month's promise: no date, and the reason", () => {
    expect(callPromiseAsk(loaded({ monthPromise: promise("KEPT"), create: null, edit: null })))
      .toEqual({ asksDate: false, range: null, hint: "Bu o'quvchiga shu oy va'da yozilgan — to'lov sanasi kiritilmaydi.", moves: false });
  });

  it("a failed lookup asks no date and sends none, like the payment dialog", () => {
    expect(callPromiseAsk({ data: undefined, isError: true })).toEqual({ asksDate: false, range: null, hint: FAILED, moves: false });
  });

  it("while loading the date is still asked (submit waits for the range)", () => {
    expect(callPromiseAsk({ data: undefined, isError: false })).toEqual({ asksDate: true, range: null, hint: null, moves: false });
  });

  it("both dialogs say the same thing when a date moves the month's promise", () => {
    expect(PROMISE_MOVE_NOTE).toBe("Shu oy yozilgan va'daning sanasi o'zgaradi (ko'pi bilan 7 kunga).");
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
