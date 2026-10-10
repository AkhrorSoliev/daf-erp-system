import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { DebtSubpage } from "./debt-subpage";

const src = (file: string) => readFileSync(join(__dirname, "..", file), "utf-8");
const route = (...parts: string[]) => join(__dirname, "..", "..", "..", "app", "(dashboard)", "payments", ...parts, "page.tsx");

describe("debt sub-pages (spec B2a §2.6)", () => {
  it("each has a back link to Qarzdorlik and its title", () => {
    const html = renderToStaticMarkup(createElement(DebtSubpage, { title: "Kechirilgan qarzlar arxivi" }, "x"));
    expect(html).toContain('href="/payments/debt"');
    expect(html).toContain("Qarzdorlik");
    expect(html).toContain("Kechirilgan qarzlar arxivi");
  });

  it("the breadcrumb names the two sub-pages", () => {
    expect(routeLabels["debt-history"]).toBe("Qarz tarixi");
    expect(routeLabels["debt-write-offs"]).toBe("Kechirilgan qarzlar");
  });
});

describe("«Muzlatilganlarning puli» moved to «Qaytariladigan pul» (spec B2b §3.8)", () => {
  it("the debt page links the frozen tab there; the old view and its label are gone", () => {
    expect(src("debt/debt-page.tsx")).toContain('href="/payments/refunds?tab=muzlatilgan"');
    expect(existsSync(join(__dirname, "frozen-balance-view.tsx"))).toBe(false);
    expect(routeLabels["frozen-balances"]).toBeUndefined();
  });

  it("the old address redirects to the frozen tab", () => {
    expect(readFileSync(route("frozen-balances"), "utf-8")).toContain('redirect("/payments/refunds?tab=muzlatilgan")');
  });
});

describe("«Markaz qoplagani» lives on Ish haqi (ADR-0072)", () => {
  it("the salary page has the tab, and its card links there, never to the debt page", () => {
    expect(src("salary-client.tsx")).toContain('value="markaz"');
    expect(src("salary-monthly-view.tsx")).not.toContain("/payments/debt?tab=markaz");
    expect(src("salary-monthly-view.tsx")).toContain("/payments/salary?tab=markaz&month=");
  });

  it("the month lives in its own URL state, not the debt page's", () => {
    expect(src("debt/center-topup-view.tsx")).not.toContain("useDebtFilters");
  });
});
