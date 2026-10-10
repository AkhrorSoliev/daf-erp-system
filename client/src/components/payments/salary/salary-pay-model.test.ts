import { describe, expect, it } from "vitest";
import { accountsByKind, buildPayBody, payTitle, payToast, sliceCheck } from "./salary-pay-model";
import type { SalaryDetail } from "./salary-types";

// Intl writes a no-break space between thousands; the expectations use a plain one.
const plain = (s: string) => s.replace(/\u00A0/g, " ");

describe("sliceCheck", () => {
  it("is green when cash and card close the sum", () => {
    const r = sliceCheck(7_840_000, 5_000_000, 2_840_000);
    expect(r.ok).toBe(true);
    expect(plain(r.text)).toBe("✓ Naqd + karta = 7 840 000 so'm");
  });

  it("is red, and says both numbers, when they do not", () => {
    const r = sliceCheck(7_840_000, 5_000_000, 2_000_000);
    expect(r.ok).toBe(false);
    expect(plain(r.text)).toBe("Naqd + karta 7 840 000 so'm bo'lishi kerak, hozir 7 000 000 so'm");
  });

  it("is red when the slices are more than the sum", () => {
    expect(sliceCheck(1_000_000, 900_000, 200_000).ok).toBe(false);
  });

  it("accepts a 0 so'm payment with nothing typed", () => {
    expect(sliceCheck(0, 0, 0).ok).toBe(true);
  });
});

describe("buildPayBody", () => {
  const base = {
    paidAt: "2026-10-05",
    total: 7_840_000,
    cashAccountId: "cash-1",
    cash: 5_000_000,
    cardAccountId: "card-1",
    card: 2_840_000,
    note: "",
  };

  it("sends one slice per account that carries money", () => {
    expect(buildPayBody(base)).toEqual({
      paidAt: "2026-10-05",
      cashSlices: [
        { cashAccountId: "cash-1", amount: 5_000_000 },
        { cashAccountId: "card-1", amount: 2_840_000 },
      ],
    });
  });

  it("drops a zero amount instead of sending it", () => {
    expect(buildPayBody({ ...base, cash: 7_840_000, card: 0 }).cashSlices).toEqual([
      { cashAccountId: "cash-1", amount: 7_840_000 },
    ]);
    expect(buildPayBody({ ...base, cash: 0, card: 7_840_000 }).cashSlices).toEqual([
      { cashAccountId: "card-1", amount: 7_840_000 },
    ]);
  });

  it("sends no slices for a 0 so'm payment", () => {
    const body = buildPayBody({ ...base, total: 0, cash: 0, card: 0 });
    expect(body.cashSlices).toEqual([]);
    expect(body.paidAt).toBe("2026-10-05");
  });

  it("leaves out a slice that has no account", () => {
    expect(buildPayBody({ ...base, cashAccountId: null, card: 0 }).cashSlices).toEqual([]);
  });

  it("omits a blank note and trims a real one", () => {
    expect(buildPayBody({ ...base, note: "   " })).not.toHaveProperty("note");
    expect(buildPayBody({ ...base, note: "  Naqd berildi  " }).note).toBe("Naqd berildi");
  });
});

describe("accountsByKind", () => {
  it("puts CASH under cash, BANK and CARD under card", () => {
    const accounts: SalaryDetail["cashAccounts"] = [
      { id: "a", name: "Asosiy kassa", type: "CASH" },
      { id: "b", name: "Bank hisobi", type: "BANK" },
      { id: "c", name: "Humo karta", type: "CARD" },
    ];
    const { cash, card } = accountsByKind(accounts);
    expect(cash.map((a) => a.id)).toEqual(["a"]);
    expect(card.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("answers two empty lists for a branch without accounts", () => {
    expect(accountsByKind([])).toEqual({ cash: [], card: [] });
  });
});

describe("payToast", () => {
  it("says the staff member was told, only when the server says so", () => {
    expect(payToast(true)).toBe("Berildi — xodimga xabar yuborildi");
    expect(payToast(false)).toBe("Berildi");
  });
});

describe("payTitle", () => {
  it("names the person and the month in lower case", () => {
    expect(payTitle("Madina", "2026-09")).toBe("Madina — sentabr oyligi berildi");
  });
});
