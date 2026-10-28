import { describe, expect, it } from "vitest";
import { bankFeeBody, checklistRows, closeMonth, pictureRows } from "./month-close-model";
import type { MonthCloseView } from "./month-close-types";

const view: MonthCloseView = {
  month: "2026-09",
  ended: true,
  netProfit: {
    revenue: 100, balanceWithdrawals: 0, teacherSalary: 30, adminSalary: 10, operatingExpenses: 20, refunds: 0, netProfit: 31,
    taxes: { providerFees: 2, turnoverTax: 4, employerSocialTax: 3, withholding: 3, bankPaidSalary: 25, total: 9, missingRates: [] },
  },
  bankAccounts: [{ id: "a1", name: "Bank", branchId: 1, branchName: "Toshkent", amount: null }],
  salaries: { paid: 3, total: 4 },
  checklist: { bankFeesEntered: false, salariesPaid: false, ratesComplete: true },
};

describe("pictureRows", () => {
  it("carries the server's figures, expenses and taxes negative", () => {
    expect(pictureRows(view).map((r) => [r.label, r.amount])).toEqual([
      ["Tushum", 100], ["O'qituvchilar oyligi", -30], ["Xodimlar oyligi", -10], ["Xarajatlar (bank xizmati bilan)", -20],
      ["To'lov komissiyasi", -2], ["Aylanma solig'i", -4], ["Korxona ijtimoiy solig'i", -3], ["Sof foyda", 31],
    ]);
  });

  it("adds withdrawn balance after revenue and refunds after expenses only when above 0", () => {
    const v = { ...view, netProfit: { ...view.netProfit, balanceWithdrawals: 7, refunds: 5 } };
    expect(pictureRows(v).map((r) => [r.label, r.amount])).toEqual([
      ["Tushum", 100], ["Yechib olingan balans", 7], ["O'qituvchilar oyligi", -30], ["Xodimlar oyligi", -10],
      ["Xarajatlar (bank xizmati bilan)", -20], ["Qaytarilgan pul", -5],
      ["To'lov komissiyasi", -2], ["Aylanma solig'i", -4], ["Korxona ijtimoiy solig'i", -3], ["Sof foyda", 31],
    ]);
  });
});

describe("checklistRows", () => {
  it("says what is missing", () => {
    expect(checklistRows(view)).toEqual([
      { ok: false, text: "Bank xarajati: 1 ta hisobdan 0 tasi kiritilgan" },
      { ok: false, text: "Oyliklar: 4 tadan 3 tasi berilgan" },
      { ok: true, text: "Stavkalar to'liq" },
    ]);
  });

  it("names a missing bank account and incomplete rates", () => {
    const v = { ...view, bankAccounts: [], checklist: { ...view.checklist, ratesComplete: false } };
    expect(checklistRows(v).map((r) => r.text)).toEqual([
      "Bank xarajati: bank hisobi yo'q",
      "Oyliklar: 4 tadan 3 tasi berilgan",
      "Stavkalar to'liq emas — Sozlamalar → Soliq va komissiyalar",
    ]);
  });
});

describe("bankFeeBody", () => {
  it("sends only filled drafts as whole so'm", () => {
    expect(bankFeeBody(view.bankAccounts, { a1: "125000" })).toEqual({ items: [{ cashAccountId: "a1", amount: 125000 }] });
    expect(bankFeeBody(view.bankAccounts, { a1: "" })).toEqual({ items: [] });
    expect(bankFeeBody(view.bankAccounts, {})).toEqual({ items: [] });
  });
});

describe("closeMonth", () => {
  it("opens on the previous month, kept inside 2026-10 … the current month", () => {
    expect(closeMonth("", "2026-12")).toBe("2026-11");
    expect(closeMonth("", "2027-01")).toBe("2026-12");
    expect(closeMonth("", "2026-10")).toBe("2026-10");
    expect(closeMonth("2026-10", "2026-12")).toBe("2026-10");
    expect(closeMonth("2026-09", "2026-12")).toBe("2026-10");
    expect(closeMonth("2026-01", "2026-12")).toBe("2026-10");
    expect(closeMonth("2027-03", "2026-12")).toBe("2026-12");
    expect(closeMonth("abc", "2026-12")).toBe("2026-11");
  });
});
