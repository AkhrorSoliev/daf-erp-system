import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import {
  accountOptions, cancelConsequence, drawerKindLine, duePill, handedCell, noticeText, pendingEmptyText, pendingSumLine,
  requestDueLine, requestOpenedText, sinceText, tabSubline, transferLine,
} from "./refunds-format";
import { cleanHistoryPage, readRefundsFilters, refundableListParams } from "./refunds-url";

// Made-up figures only.
const money = (n: number) => `${formatNumber(n)} so'm`;

describe("pending «Holat» (spec §3.3)", () => {
  it("bank days left: muted, amber at 2 or fewer; the due day itself says so", () => {
    expect(duePill({ overdue: false, bankDays: 10 })).toEqual({ text: "10 bank kuni qoldi", tone: "muted" });
    expect(duePill({ overdue: false, bankDays: 3 }).tone).toBe("muted");
    expect(duePill({ overdue: false, bankDays: 2 })).toEqual({ text: "2 bank kuni qoldi", tone: "amber" });
    expect(duePill({ overdue: false, bankDays: 0 })).toEqual({ text: "bugun oxirgi kun", tone: "amber" });
  });

  it("overdue is red with the count; with 0 bank days (the weekend after a Friday) without it", () => {
    expect(duePill({ overdue: true, bankDays: 2 })).toEqual({ text: "muddati o'tdi · 2 bank kuni", tone: "red" });
    expect(duePill({ overdue: true, bankDays: 0 })).toEqual({ text: "muddati o'tdi", tone: "red" });
  });

  it("the header line and the empty block", () => {
    expect(pendingSumLine(1_240_000, 3)).toBe(`${money(1_240_000)} · 3 ta so'rov`);
    expect(pendingEmptyText(null)).toBe("Hozir kutilayotgan pul qaytarish yo'q.");
    expect(pendingEmptyText("2026-10-01T09:00:00Z")).toBe("Hozir kutilayotgan pul qaytarish yo'q. Oxirgisi 01.10 da berilgan.");
  });
});

describe("tab cells (spec §3.4)", () => {
  it("the tab buttons' small lines", () => {
    expect(tabSubline("muzlatilgan", 7, 4)).toBe("7 kishi · 4 tasi 30 kundan oshgan");
    expect(tabSubline("guruhsiz", 5, 4)).toBe("5 kishi · guruhga qo'shilmagan");
    expect(tabSubline("ketgan", 2, 4)).toBe("2 kishi · pulini olib ketmagan");
  });

  it("«dd.MM · N kun» and «Xabar»", () => {
    expect(sinceText("2026-09-15", 25)).toBe("15.09 · 25 kun");
    expect(noticeText(null)).toBe("berilmagan");
    expect(noticeText({ date: "2026-10-03", channel: "BOT" })).toBe("03.10 · bot orqali");
    expect(noticeText({ date: "2026-08-25", channel: "CALL" })).toBe("25.08 · qo'ng'iroq qilib aytildi");
  });
});

describe("dialogs and drawer", () => {
  it("«Qaysi kassadan» lists only the request's branch, type first", () => {
    const accounts = [
      { id: "a1", name: "Asosiy kassa", type: "CASH" as const, branchId: 1 },
      { id: "a2", name: "Hisob raqam", type: "BANK" as const, branchId: 1 },
      { id: "a3", name: "Boshqa filial kassasi", type: "CASH" as const, branchId: 2 },
    ];
    expect(accountOptions(accounts, 1)).toEqual([
      { value: "a1", label: "Naqd — Asosiy kassa" },
      { value: "a2", label: "Bank — Hisob raqam" },
    ]);
    expect(accountOptions(accounts, null)).toEqual([]);
  });

  it("the cancel consequence names the amount", () => {
    expect(cancelConsequence(490_000)).toBe(
      `Pul hali berilmagan. Bekor qilinsa, ${formatNumber(490_000)} so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.`,
    );
  });

  it("the transfer condition: the server's refusal while locked, the green line once open", () => {
    const refusal = "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).";
    expect(transferLine({ notice: { date: "2026-10-10", channel: "BOT" }, termEnds: "2026-10-23", allowedFrom: "2026-11-22", allowed: false, refusal }))
      .toEqual({ allowed: false, text: refusal });
    expect(transferLine({ notice: { date: "2026-08-25", channel: "CALL" }, termEnds: "2026-09-08", allowedFrom: "2026-10-08", allowed: true, refusal: null }))
      .toEqual({ allowed: true, text: "Shart bajarilgan: xabar 25.08, muddat 08.09 da tugagan, 30 kun o'tdi." });
  });

  it("the drawer's «Holat»", () => {
    expect(drawerKindLine({ kind: "muzlatilgan", since: "2026-09-15", days: 25 })).toBe("Muzlatilgan · 15.09 · 25 kun");
    expect(drawerKindLine({ kind: null, since: null, days: null })).toBe("o'qiyapti");
  });

  it("the refund dialog's line and toast read the due date", () => {
    expect(requestDueLine("2026-10-23")).toBe(
      "So'rov ochilgach bu summa balansdan darhol ayiriladi. Pul 23.10 gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.",
    );
    expect(requestOpenedText("2026-10-23")).toBe("So'rov ochildi — pul 23.10 gacha beriladi");
    expect(requestOpenedText(null)).toBe("So'rov ochildi");
  });

  it("history «Berildi»: day and method, or the cancelled pill with its reason", () => {
    const base = { handedOverAt: "2026-09-24T06:00:00Z", cancelReason: null };
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: "CASH" })).toEqual({ cancelled: false, text: "24.09 · naqd" });
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: "TRANSFER" })).toEqual({ cancelled: false, text: "24.09 · karta" });
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: null })).toEqual({ cancelled: false, text: "24.09" });
    expect(handedCell({ status: "REJECTED", handedOverAt: null, refundMethod: null, cancelReason: "Guruhga qaytdi" }))
      .toEqual({ cancelled: true, reason: "Guruhga qaytdi" });
  });
});

describe("the URL and the request", () => {
  it("defaults: Muzlatilganlar, page 1 of 20, pending page 1 of 10", () => {
    expect(refundableListParams(readRefundsFilters(""))).toEqual({
      tab: "muzlatilgan", age: undefined, search: undefined, page: 1, pageSize: 20, pendingPage: 1, pendingPageSize: 10,
    });
  });

  it("the age chip only on Muzlatilganlar, only the server's values", () => {
    expect(refundableListParams(readRefundsFilters("age=over60")).age).toBe("over60");
    expect(refundableListParams(readRefundsFilters("tab=ketgan&age=over60")).age).toBeUndefined();
    expect(refundableListParams(readRefundsFilters("age=d90")).age).toBeUndefined();
  });

  it("a value the server would refuse falls back to its default", () => {
    expect(refundableListParams(readRefundsFilters("tab=xyz&page=0&pageSize=7&pendingPage=-2&pendingPageSize=60"))).toMatchObject({
      tab: "muzlatilgan", page: 1, pageSize: 20, pendingPage: 1, pendingPageSize: 10,
    });
    expect(refundableListParams(readRefundsFilters("search=%20%20ali%20")).search).toBe("ali");
    expect(refundableListParams(readRefundsFilters(`search=${"a".repeat(150)}`)).search).toHaveLength(100);
    expect(cleanHistoryPage(0, 15)).toEqual({ page: 1, pageSize: 10 });
    expect(cleanHistoryPage(3, 50)).toEqual({ page: 3, pageSize: 50 });
  });
});
