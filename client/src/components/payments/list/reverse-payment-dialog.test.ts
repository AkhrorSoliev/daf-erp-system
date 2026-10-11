import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { formatPrice } from "@/lib/format-utils";

// A dialog's content renders in a portal, and only while open; draw it inline.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogDescription: Pass, DialogFooter: Pass };
});

import { canSubmitReason, ReversePaymentDialog } from "./reverse-payment-dialog";
import type { PaymentRow } from "./payments-list-types";

// Made-up names and figures.
const ROW: PaymentRow = {
  id: "p1",
  createdAt: "2026-09-26T13:20:00.000Z", // 18:20 in Tashkent
  amount: 450_000,
  method: "CASH",
  source: "ADMIN_MANUAL",
  online: false,
  status: "COMPLETED",
  receiptCode: null,
  receiptNumber: null,
  note: null,
  student: { id: 10001, firstName: "Ism", lastName: "Familiya", phone: "998900000000", archived: false },
  groups: [],
  receivedBy: null,
  parts: null,
  balanceBefore: null,
  balanceAfter: null,
  reversal: null,
  correctedBy: null,
  correctsPayment: null,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const wrap = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));
const noop = () => {};

describe("ReversePaymentDialog (spec B4 §3.9)", () => {
  const html = wrap(createElement(ReversePaymentDialog, { row: ROW, onClose: noop, onDone: noop }));
  const text = norm(html);

  it("names the payment, the consequence, the reason field and both buttons", () => {
    expect(text).toContain("To'lovni bekor qilish");
    expect(text).toContain(`Ism Familiya — ${norm(formatPrice(450_000))} so'm, 26.09.2026 18:20.`);
    expect(text).toContain(
      "Pul o'quvchi balansidan olinadi, o'quvchiga Telegram'da xabar boradi. Bekor qilingan to'lov ro'yxatda «Bekor qilinganlar» filtrida qoladi.",
    );
    expect(text).toContain("Sabab");
    expect(html).toContain("Masalan: to&#x27;lov xato o&#x27;quvchiga yozilgan");
    expect(text).toContain("0 / 500");
    expect(text).toContain("Yopish");
    expect(text).toContain("Bekor qilish");
  });

  it("«Bekor qilish» is disabled while the reason is empty", () => {
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Bekor qilish/);
  });

  it("draws nothing without a payment", () => {
    expect(wrap(createElement(ReversePaymentDialog, { row: null, onClose: noop, onDone: noop }))).toBe("");
  });

  it("canSubmitReason: trimmed length 1..500", () => {
    expect(canSubmitReason("")).toBe(false);
    expect(canSubmitReason("   ")).toBe(false);
    expect(canSubmitReason(" xato ")).toBe(true);
    expect(canSubmitReason("a".repeat(500))).toBe(true);
    expect(canSubmitReason("a".repeat(501))).toBe(false);
  });
});
