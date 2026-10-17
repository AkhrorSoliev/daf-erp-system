import { describe, expect, it } from "vitest";
import type { Recipient } from "./telegram-report-api";
import { branchSummary, filterRecipients, formatWhen, reachMeta, summarize } from "./recipient-view";

const rec = (over: Partial<Recipient> = {}): Recipient => ({
  id: 1, userId: 50, name: "Ali Valiyev", position: "Administrator", sendTime: "21:00",
  layout: "BY_SECTION", allBranches: false, branchIds: [1], sections: ["STUDENTS"], isActive: true,
  lastSentDate: null, telegramLinked: true, noBranch: false,
  reach: "LINKED", blockedAt: null, lastAttempt: null, ...over,
});
const NOW = new Date("2026-10-17T12:00:00Z"); // 17:00 Tashkent

describe("filterRecipients", () => {
  const list = [
    rec({ id: 1, name: "Ali Valiyev", position: "Administrator" }),
    rec({ id: 2, name: "Dilnoza Karimova", position: "Filial direktori", reach: "BLOCKED" }),
    rec({ id: 3, name: "Sardor Aliyev", position: "Kassir", reach: "UNLINKED" }),
    rec({ id: 4, name: "Madina Rahimova", isActive: false }),
  ];
  it("searches name and position, ignoring case and spaces at the ends", () => {
    expect(filterRecipients(list, "  ali ", "all").map((r) => r.id)).toEqual([1, 3]);
    expect(filterRecipients(list, "DIREKTOR", "all").map((r) => r.id)).toEqual([2]);
  });
  it("«problem» = blocked or unlinked; «off» = switched off", () => {
    expect(filterRecipients(list, "", "problem").map((r) => r.id)).toEqual([2, 3]);
    expect(filterRecipients(list, "", "off").map((r) => r.id)).toEqual([4]);
  });
  it("«problem» also lists a linked recipient whose last report failed", () => {
    const failed = rec({ id: 5, lastAttempt: { at: "2026-10-17T11:00:00Z", ok: false, note: "Xabar juda uzun" } });
    expect(filterRecipients([...list, failed], "", "problem").map((r) => r.id)).toEqual([2, 3, 5]);
  });
  it("combines the query with the filter", () => {
    expect(filterRecipients(list, "ali", "problem").map((r) => r.id)).toEqual([3]);
  });
});

describe("summarize", () => {
  it("counts all, reaching (not blocked/unlinked) and problems", () => {
    const list = [rec({ reach: "DELIVERED" }), rec({ reach: "LINKED" }), rec({ reach: "BLOCKED" }), rec({ reach: "UNLINKED" })];
    expect(summarize(list)).toEqual({ total: 4, reaching: 2, problem: 2 });
  });
  it("a linked recipient with a failed last attempt is a problem; a delivered one is not", () => {
    const failed = { at: "2026-10-17T11:00:00Z", ok: false, note: null };
    const list = [rec({ reach: "LINKED", lastAttempt: failed }), rec({ reach: "DELIVERED", lastAttempt: failed }), rec()];
    expect(summarize(list)).toEqual({ total: 3, reaching: 2, problem: 1 });
  });
});

describe("reachMeta", () => {
  it("DELIVERED shows the last attempt", () => {
    const m = reachMeta(rec({ reach: "DELIVERED", lastAttempt: { at: "2026-10-17T11:00:00Z", ok: true, note: null } }), NOW);
    expect(m).toEqual({ label: "Yetadi", tone: "ok", note: "oxirgi: bugun 16:00" });
  });
  it("LINKED says nothing was sent yet", () => {
    expect(reachMeta(rec(), NOW)).toEqual({ label: "Ulangan", tone: "ok", note: "hali yuborilmagan" });
  });
  it("LINKED with a failed last attempt warns with the reason and the time", () => {
    const at = "2026-10-17T11:00:00Z";
    expect(reachMeta(rec({ lastAttempt: { at, ok: false, note: "Xabar juda uzun" } }), NOW)).toEqual({
      label: "Ulangan", tone: "warn", note: "oxirgi urinish: Xabar juda uzun · bugun 16:00",
    });
    expect(reachMeta(rec({ lastAttempt: { at, ok: false, note: null } }), NOW).note).toBe("oxirgi urinish: yuborilmadi · bugun 16:00");
    expect(reachMeta(rec({ lastAttempt: { at, ok: true, note: null } }), NOW).tone).toBe("ok");
  });
  it("BLOCKED shows the last failure note or the default reason, with the date", () => {
    expect(reachMeta(rec({ reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z" }), NOW)).toEqual({
      label: "Yetmaydi", tone: "bad", note: "botni bloklagan · 16.10 dan",
    });
    expect(reachMeta(rec({ reach: "BLOCKED" }), NOW).note).toBe("xabar qabul qilinmayapti");
    expect(reachMeta(rec({ reach: "BLOCKED", blockedAt: "2026-10-16T10:00:00Z", lastAttempt: { at: "2026-10-16T16:00:00Z", ok: false, note: "Telegram hisobini o'chirgan" } }), NOW).note)
      .toBe("Telegram hisobini o'chirgan · 16.10 dan");
  });
  it("UNLINKED tells what to do", () => {
    expect(reachMeta(rec({ reach: "UNLINKED" }), NOW)).toEqual({ label: "Ulanmagan", tone: "warn", note: "botda /xodim kerak" });
  });
  it("a switched-off recipient is «O'chirilgan» whatever the reach", () => {
    expect(reachMeta(rec({ isActive: false, reach: "BLOCKED" }), NOW).tone).toBe("off");
  });
});

describe("formatWhen", () => {
  it("«bugun» for the Tashkent day of now, DD.MM otherwise", () => {
    expect(formatWhen("2026-10-17T11:00:00Z", NOW)).toBe("bugun 16:00");
    expect(formatWhen("2026-10-16T11:00:00Z", NOW)).toBe("16.10 16:00");
    // 16.10 20:00Z is 17.10 01:00 in Tashkent: the next day, so «bugun».
    expect(formatWhen("2026-10-16T20:00:00Z", NOW)).toBe("bugun 01:00");
  });
});

describe("branchSummary", () => {
  const branches = [{ id: 1, name: "Farg'ona" }, { id: 2, name: "Namangan" }];
  it("names the branches, «hamma filial» for all, a warning for none", () => {
    expect(branchSummary(rec(), branches)).toBe("Farg'ona");
    expect(branchSummary(rec({ branchIds: [1, 2] }), branches)).toBe("Farg'ona, Namangan");
    expect(branchSummary(rec({ allBranches: true }), branches)).toBe("hamma filial");
    expect(branchSummary(rec({ branchIds: [], noBranch: true }), branches)).toBe("filial tanlanmagan");
  });
});
