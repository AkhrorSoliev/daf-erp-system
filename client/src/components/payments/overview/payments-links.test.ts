import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { paymentsListHref } from "@/components/payments/list/payments-url";
import { CashLinks } from "./cash-card";
import { AllPaymentsButton } from "./income-dialog";

const hrefOf = (html: string, label: string) => {
  const m = html.match(new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}`));
  return m?.[1]?.replace(/&amp;/g, "&");
};

describe("links from «Umumiy ma'lumotlar» to «To'lovlar»", () => {
  it("the cash card links «To'lovlar →» to the page's month, beside «Qayerdan keldi →»", () => {
    for (const month of ["2026-10", "2026-09", "2026-07"]) {
      const html = renderToStaticMarkup(createElement(CashLinks, { month, current: "2026-10" }));
      expect(html).toContain("Qayerdan keldi →");
      expect(hrefOf(html, "To&#x27;lovlar →")).toBe(paymentsListHref(month, "2026-10"));
    }
  });

  it("the income dialog's footer links «Barcha to'lovlar» to the dialog's month", () => {
    const html = renderToStaticMarkup(createElement(AllPaymentsButton, { month: "2026-07" }));
    expect(hrefOf(html, "Barcha to&#x27;lovlar")).toBe("/payments/list?davr=oraliq&dan=2026-07-01&gacha=2026-07-31");
  });
});
