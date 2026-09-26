import { describe, expect, it } from "vitest";
import {
  CORRECTION_WINDOW_MS,
  appendLedgerPage,
  asOfText,
  canCorrectPayment,
  dayMonth,
  statementPdfName,
} from "./statement-utils";
import type { ModelAllocation } from "./statement-types";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const payment = (over: Partial<ModelAllocation> = {}): ModelAllocation => ({
  kind: "payment",
  paymentId: "p1",
  method: "CASH",
  amount: 100_000,
  at: "2026-09-25T12:00:00.000Z",
  ...over,
});

describe("canCorrectPayment", () => {
  const ceo = { isCeo: true, canCorrect: true };
  const admin = { isCeo: false, canCorrect: true };

  it("lets the CEO correct a payment of any age", () => {
    expect(
      canCorrectPayment(payment({ at: "2026-01-01T00:00:00.000Z" }), ceo, NOW),
    ).toBe(true);
  });

  it("lets roles 1-3 correct a payment only within 72 hours", () => {
    const edge = new Date(NOW - CORRECTION_WINDOW_MS).toISOString();
    const late = new Date(NOW - CORRECTION_WINDOW_MS - 1000).toISOString();
    expect(canCorrectPayment(payment({ at: edge }), admin, NOW)).toBe(true);
    expect(canCorrectPayment(payment({ at: late }), admin, NOW)).toBe(false);
  });

  it("never offers it without the right role, on a credit or on a non-payment", () => {
    expect(
      canCorrectPayment(payment(), { isCeo: false, canCorrect: false }, NOW),
    ).toBe(false);
    expect(
      canCorrectPayment(payment({ kind: "credit", paymentId: null, at: null }), ceo, NOW),
    ).toBe(false);
    expect(canCorrectPayment(payment({ amount: 0 }), ceo, NOW)).toBe(false);
    expect(canCorrectPayment(payment({ at: null }), admin, NOW)).toBe(false);
  });
});

describe("appendLedgerPage", () => {
  it("adds the next page and drops rows already shown", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    expect(appendLedgerPage([a, b], [b, c])).toEqual([a, b, c]);
  });
});

describe("text helpers", () => {
  it("takes the date part of the as-of line", () => {
    expect(asOfText("DaF Sprachzentrum · 26.09.2026 holatiga")).toBe(
      "26.09.2026 holatiga",
    );
  });

  it("formats a lesson day as dd.MM", () => {
    expect(dayMonth("2026-09-07")).toBe("07.09");
  });

  it("names the PDF like the server does", () => {
    expect(statementPdfName(10042, "2026-09-26")).toBe(
      "tolovlar-hisoboti-10042-26-09-2026.pdf",
    );
  });
});
