import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LedgerTableRow } from "./statement-ledger";

type Row = Parameters<typeof LedgerTableRow>[0]["row"];

function render(row: Row): string {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(
        "table",
        null,
        createElement("tbody", null, createElement(LedgerTableRow, { row, index: 0 })),
      ),
    ),
  )
    .replace(/&#x27;/g, "'")
    .replace(/\u00a0/g, " ");
}

const reason = "Oylik to'lovga o'tish migratsiyasi";

// The monthly switch cancelled the old per-lesson charges. Listed with no
// mark, a cancelled charge read as one still standing next to its own undo.
describe("Barcha yozuvlar row", () => {
  it("strikes a cancelled charge through and says when and why", () => {
    const html = render({
      id: "charge",
      type: "LESSON_DEDUCTION",
      amount: -37500,
      balanceAfter: -137500,
      description: "Dars uchun yechildi",
      createdAt: "2026-09-18T07:47:00.000Z",
      reversal: { kind: "reversed", at: "2026-09-25T17:41:00.000Z", reason },
    });
    expect(html).toContain("Darsga yechildi");
    expect(html).toContain("Bekor qilingan");
    expect(html).toContain(`25.09.2026 da bekor qilingan: ${reason}`);
    expect(html).toMatch(/class="[^"]*line-through[^"]*">-37 500/);
  });

  it("labels the undo «Bekor qilish» and names the charge it undid", () => {
    const html = render({
      id: "undo",
      type: "LESSON_DEDUCTION",
      amount: 37500,
      balanceAfter: 87500,
      description: `Bekor qilindi: ${reason}`,
      createdAt: "2026-09-25T17:41:00.000Z",
      reversal: {
        kind: "undo",
        originalAt: "2026-09-18T07:47:00.000Z",
        originalAmount: -37500,
        reason,
      },
    });
    expect(html).toContain("Bekor qilish");
    expect(html).not.toContain("Darsga yechildi");
    expect(html).toContain(`18.09.2026 dagi -37 500 so'm bekor qilindi: ${reason}`);
    expect(html).not.toContain("line-through");
  });

  it("leaves an ordinary row as it was", () => {
    const html = render({
      id: "pay",
      type: "PAYMENT",
      amount: 300000,
      balanceAfter: 100000,
      description: "To'lov qabul qilindi",
      createdAt: "2026-09-23T06:35:00.000Z",
      reversal: null,
    });
    expect(html).toContain("To'lov qabul qilindi");
    expect(html).not.toContain("Bekor");
    expect(html).not.toContain("line-through");
  });
});
