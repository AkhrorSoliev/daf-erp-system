import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/payments/refunds", roleId: 4 }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: (select: (s: unknown) => unknown) => select({ user: { roles: [{ id: state.roleId }] } }),
}));
vi.mock("./payments-mobile-menu", () => ({ PaymentsMobileMenu: () => null }));

import { PaymentsLayoutShell } from "./payments-layout-shell";

const render = (pathname: string, roleId: number) => {
  state.pathname = pathname;
  state.roleId = roleId;
  return renderToStaticMarkup(createElement(PaymentsLayoutShell, null, "page"));
};

describe("PaymentsLayoutShell — role-gated paths", () => {
  it.each(["/payments/refunds", "/payments/refunds/history"])("%s is closed to a Teacher, open to the Cashier", (path) => {
    expect(render(path, 4)).toBe("");
    for (const role of [1, 2, 3, 5]) expect(render(path, role)).toContain("page");
  });

  it("Xarajatlar and Ish haqi stay CEO/Branch Director only", () => {
    expect(render("/payments/salary", 3)).toBe("");
    expect(render("/payments/expenses", 5)).toBe("");
    expect(render("/payments/salary", 2)).toContain("page");
  });

  it("another Moliya page is not gated here", () => {
    expect(render("/payments/debt", 4)).toContain("page");
  });
});
