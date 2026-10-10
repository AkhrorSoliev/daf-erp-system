import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { formatNumber } from "@/lib/format-utils";

// A dialog's content renders in a portal, and only while open; draw it inline.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogDescription: Pass, DialogFooter: Pass };
});

import { CancelRefundDialog, HandOverDialog } from "./pending-dialogs";
import type { PendingRefundRow } from "./refunds-types";

// Made-up names and figures.
const TARGET: PendingRefundRow = {
  id: "r1", studentId: 10002, firstName: "Vali", lastName: "Aliyev", phone: "931234567", branchId: 1,
  amount: 620_000, requestedAt: "2026-10-09T06:00:00Z", dueDate: "2026-10-23", due: { overdue: false, bankDays: 9 }, reason: null,
};
const ACCOUNT = { id: "a1", name: "Asosiy kassa", type: "CASH" as const, branchId: 1 };

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const wrap = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));
const num = (n: number) => norm(formatNumber(n));
const noop = () => {};
const disabledButton = (raw: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>(?:(?!</button>).)*${label}`).test(raw);

describe("«Berildi» dialog (spec §3.3)", () => {
  it("names the request, the amount, the drawer field and the note", () => {
    const text = norm(wrap(createElement(HandOverDialog, { target: TARGET, accounts: [ACCOUNT], onClose: noop })));
    expect(text).toContain("Pul berildi");
    expect(text).toContain("Vali Aliyev · so'rov 09.10 · muddat 23.10");
    expect(text).toContain(`Berilgan summa ${num(620_000)} so'm`);
    expect(text).toContain("Qaysi kassadan");
    expect(text).toContain("Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.");
    expect(text).toContain("Yopish Berildi");
  });

  it("one account is picked for you; none in the branch says so and keeps «Berildi» shut", () => {
    expect(disabledButton(wrap(createElement(HandOverDialog, { target: TARGET, accounts: [ACCOUNT], onClose: noop })), "Berildi")).toBe(false);
    const raw = wrap(createElement(HandOverDialog, { target: TARGET, accounts: [{ ...ACCOUNT, branchId: 2 }], onClose: noop }));
    expect(norm(raw)).toContain("O'quvchining filialida kassa topilmadi");
    expect(disabledButton(raw, "Berildi")).toBe(true);
  });
});

describe("«Bekor qilish» dialog (spec §3.3)", () => {
  it("states the consequence and asks for a reason before the red button opens", () => {
    const raw = wrap(createElement(CancelRefundDialog, { target: TARGET, onClose: noop }));
    const text = norm(raw);
    expect(text).toContain("So'rovni bekor qilish");
    expect(text).toContain(`Vali Aliyev · ${num(620_000)} so'm`);
    expect(text).toContain(`Bekor qilinsa, ${num(620_000)} so'm o'quvchi balansiga qaytadi`);
    expect(text).toContain("Sabab");
    expect(disabledButton(raw, "Bekor qilish")).toBe(true);
  });
});
