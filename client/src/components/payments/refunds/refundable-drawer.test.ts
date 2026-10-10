import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { canForRoles } from "@/test-support/server-catalog";
import { RefundableDrawerBody } from "./refundable-drawer";
import { TransferNote } from "./transfer-note";
import type { RefundableDrawer, TransferState } from "./refunds-types";

// Made-up names and figures; the refusal is the server's own text.
const LOCKED: TransferState = {
  notice: null, termEnds: null, allowedFrom: null, allowed: false,
  refusal: "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
};
const OPEN: TransferState = { notice: { date: "2026-08-25", channel: "CALL" }, termEnds: "2026-09-08", allowedFrom: "2026-10-08", allowed: true, refusal: null };
// The server's `noticePreview` is plain text: several lines, emoji, a blank line (Task 17).
const NOTICE = ["💰 Hisobingizda pul qolgan", "", "Hurmatli Ali!", "", "Sinov matni: <b>350 000</b> so'm.", "📞 +998 90 000 00 00"].join("\n");
const DRAWER: RefundableDrawer = {
  student: { id: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233", status: "FROZEN", branchId: 1 },
  balance: 350_000, kind: "muzlatilgan", since: "2026-09-15", days: 25,
  lastGroup: { id: "g1", name: "B1-02" }, lastPayment: { createdAt: "2026-08-12T06:00:00Z", amount: 450_000 },
  telegramLinked: true, noticePreview: NOTICE, transfer: LOCKED,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const num = (n: number) => norm(formatNumber(n));
const noop = () => {};
// The server's default capabilities: the CEO unless a test names other roles.
const html = (over: Partial<RefundableDrawer> = {}, roleIds: number[] = [1]) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(RefundableDrawerBody, { drawer: { ...DRAWER, ...over }, can: canForRoles(roleIds), onAction: noop })));
const disabledButton = (raw: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>(?:(?!</button>).)*${label}`).test(raw);

describe("RefundableDrawerBody (spec §3.5)", () => {
  it("prints the money and the five facts", () => {
    const text = norm(html());
    expect(text).toContain(`Markazdagi puli ${num(350_000)} so'm`);
    expect(text).toContain("Holat Muzlatilgan · 15.09 · 25 kun");
    expect(text).toContain("Oxirgi guruh B1-02");
    expect(text).toContain(`Oxirgi to'lov 12.08 · ${num(450_000)}`);
    expect(text).toContain("Telegram bot ulangan");
    expect(text).toContain("Xabar berilmagan");
  });

  it("the first option follows the kind: «Qaytdi» for frozen, «Guruhga qo'shish» for ungrouped, none for departed", () => {
    expect(norm(html())).toContain("Qaytdi — guruhga qaytarish Pul oyning qolgan darslari hisobiga o'tadi. Qaytarish");
    const ungrouped = norm(html({ kind: "guruhsiz" }));
    expect(ungrouped).toContain("Guruhga qo'shish Pul shu oyning qolgan darslari hisobiga o'tadi. Guruh tanlash");
    expect(ungrouped).not.toContain("Qaytdi");
    const left = norm(html({ kind: "ketgan" }));
    expect(left).not.toContain("Qaytdi");
    expect(left).not.toContain("Guruh tanlash");
    expect(left).toContain("Pulni o'quvchiga qaytarish So'rov ochiladi: balans 0 bo'ladi, pul 10 bank kuni ichida beriladi. Qaytarishni boshlash");
  });

  it("a linked chat sees the server's bot text and both buttons; an unlinked one only the call mark", () => {
    const raw = html();
    const linked = norm(raw);
    expect(linked).toContain("Hurmatli Ali! Sinov matni:");
    expect(linked).toContain("Botga xabar yuborish Qo'ng'iroq qilib aytildi");
    // Plain text with its line breaks kept (never HTML): the tag in the text stays text.
    expect(raw).toContain("whitespace-pre-line");
    expect(raw).toContain("Hurmatli Ali!\n\nSinov matni: &lt;b&gt;350 000&lt;/b&gt;");
    const unlinked = norm(html({ telegramLinked: false }));
    expect(unlinked).not.toContain("Botga xabar yuborish");
    expect(unlinked).not.toContain("Sinov matni");
    expect(unlinked).toContain("Qo'ng'iroq qilib aytildi");
    expect(unlinked).toContain("Bot ulanmagan — qo'ng'iroq qiling va belgilang.");
  });

  it("no branch phone: the bot button is shut and says why", () => {
    const raw = html({ noticePreview: null });
    expect(norm(raw)).toContain("Filial telefon raqami kiritilmagan");
    expect(disabledButton(raw, "Botga xabar yuborish")).toBe(true);
  });

  it("the transfer is locked with the server's refusal; once open, the green line and a live button", () => {
    const locked = html();
    expect(norm(locked)).toContain(LOCKED.refusal!);
    expect(disabledButton(locked, "O&#x27;tkazish")).toBe(true);
    const open = html({ transfer: OPEN });
    expect(norm(open)).toContain("Shart bajarilgan: xabar 25.08, muddat 08.09 da tugagan, 30 kun o'tdi.");
    expect(norm(open)).toContain("Xabar 25.08 · qo'ng'iroq qilib aytildi");
    expect(disabledButton(open, "O&#x27;tkazish")).toBe(false);
  });

  it("a cashier reads the facts only: no options at all", () => {
    const text = norm(html({}, [5]));
    expect(text).toContain("Markazdagi puli");
    for (const s of ["Nima qilish mumkin", "Pulni o'quvchiga qaytarish", "Xabar berish", "Markaz hisobiga o'tkazish"]) expect(text).not.toContain(s);
  });
});

describe("TransferNote — the same line in «Yechib olish»", () => {
  it("amber refusal, green condition, nothing when the server gave no text", () => {
    expect(norm(renderToStaticMarkup(createElement(TransferNote, { transfer: LOCKED })))).toContain("Avval o'quvchiga xabar bering.");
    expect(norm(renderToStaticMarkup(createElement(TransferNote, { transfer: OPEN })))).toContain("Shart bajarilgan:");
    expect(renderToStaticMarkup(createElement(TransferNote, { transfer: { ...LOCKED, refusal: null } }))).toBe("");
  });
});
