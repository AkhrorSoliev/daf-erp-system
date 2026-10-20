import { describe, expect, it } from "vitest";
import {
  correctionLocked, dateTimeText, drawerState, footerHints, headerLine, periodNote, reversalLine, sourceText, sumLabel,
} from "./payment-drawer-model";
import type { PaymentRow } from "./payments-list-types";

// Made-up names, ids and amounts.
function row(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "p1",
    createdAt: "2026-10-10T13:20:00.000Z", // 18:20 in Tashkent
    amount: 450_000,
    method: "CASH",
    source: "ADMIN_MANUAL",
    online: false,
    status: "COMPLETED",
    receiptCode: null,
    receiptNumber: null,
    note: null,
    student: { id: 10001, firstName: "Ism", lastName: "Familiya", phone: "998900000000", archived: false },
    groups: [{ id: "g1", name: "A1-01" }],
    receivedBy: null,
    parts: null,
    balanceBefore: null,
    balanceAfter: null,
    reversal: null,
    correctedBy: null,
    correctsPayment: null,
    ...over,
  };
}

describe("payment drawer model (spec B4 §3.8)", () => {
  it("headerLine: id, phone without +998, group, Tashkent time; the group part drops when there is none", () => {
    expect(headerLine(row())).toBe("ID 10001 · 90 000 00 00 · A1-01 · 10.10 18:20");
    expect(headerLine(row({ groups: [] }))).toBe("ID 10001 · 90 000 00 00 · 10.10 18:20");
  });

  it("sumLabel: plain, cancelled, corrected", () => {
    expect(sumLabel(row())).toBe("Summa");
    expect(sumLabel(row({ status: "REVERSED" }))).toBe("Summa · bekor qilingan");
    expect(sumLabel(row({ status: "REVERSED", correctedBy: { id: "n1", amount: 400_000 } }))).toBe("Summa · tuzatildi");
  });

  it("sourceText: only the gateway webhook is automatic", () => {
    expect(sourceText(row({ source: "GATEWAY_WEBHOOK" }))).toBe("Onlayn, avtomatik tushgan");
    expect(sourceText(row({ source: "ADMIN_MANUAL" }))).toBe("Admin kiritgan");
    expect(sourceText(row({ source: "STUDENT_PORTAL" }))).toBe("Admin kiritgan");
  });

  it("periodNote reads the period the server used", () => {
    expect(periodNote({ start: "2026-10-01", end: "2026-10-31", singleMonth: true, endsOnMonthEnd: true })).toBe(
      "Tanlangan davr (01.10–31.10) oxiriga ko'ra.",
    );
  });

  it("reversalLine: author and reason, no author, no reason, not cancelled", () => {
    const at = "2026-10-09T12:20:00.000Z"; // 17:20 in Tashkent
    const by = { id: 10002, firstName: "Ism", lastName: "Familiya" };
    expect(reversalLine(row({ reversal: { at, reason: "Xato yozilgan", by } }))).toBe("09.10.2026 17:20 · Ism Familiya · Sabab: Xato yozilgan");
    expect(reversalLine(row({ reversal: { at, reason: "Xato yozilgan", by: null } }))).toBe("09.10.2026 17:20 · — · Sabab: Xato yozilgan");
    expect(reversalLine(row({ reversal: { at, reason: null, by } }))).toBe("09.10.2026 17:20 · Ism Familiya · Sabab: —");
    expect(reversalLine(row())).toBeNull();
  });

  it("dateTimeText is the Tashkent wall clock", () => {
    expect(dateTimeText("2026-09-26T13:20:00.000Z")).toBe("26.09.2026 18:20");
  });

  it("footerHints come from the capabilities", () => {
    expect(footerHints({ correct: true, undo: true })).toEqual([
      "Tuzatish: summa o'zgarsa sabab yozish majburiy.",
      "To'lovni bekor qilish: sabab yozish majburiy.",
    ]);
    expect(footerHints({ correct: true, undo: false })).toEqual(["Tuzatish: summa o'zgarsa sabab yozish majburiy."]);
    expect(footerHints({ correct: false, undo: false })).toEqual([]);
  });

  it("correctionLocked: the CEO never, others after 72 hours", () => {
    const r = row({ createdAt: "2026-10-01T00:00:00.000Z" });
    const at = (hours: number) => new Date(Date.parse(r.createdAt) + hours * 3_600_000);
    expect(correctionLocked(r, true, at(500))).toBe(false);
    expect(correctionLocked(r, false, at(73))).toBe(true);
    expect(correctionLocked(r, false, at(71))).toBe(false);
  });

  it("drawerState: a 404 is «notFound», any other failure «error», no failure «ok»", () => {
    expect(drawerState({ response: { status: 404 } })).toBe("notFound");
    expect(drawerState({ response: { status: 500 } })).toBe("error");
    expect(drawerState(new Error("network"))).toBe("error");
    expect(drawerState(null)).toBe("ok");
  });
});
