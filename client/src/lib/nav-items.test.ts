import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { isNavChildActive, isNavGateOpen, navItems } from "./nav-items";

describe("navItems — «Sozlamalar»", () => {
  it("dropdown emas, /settings sahifasiga oddiy havola", () => {
    const settings = navItems.find((item) => item.url === "/settings");
    expect(settings).toBeDefined();
    // At 12 entries the dropdown pushed the rest of the sidebar down, so the
    // entries moved to the /settings page (settings-nav.ts). If children come
    // back, AppSidebar renders a dropdown again.
    expect(settings?.children).toBeUndefined();
  });
});

describe("navItems — «Qo'llanma»", () => {
  it("hamma rolga ochiq, yangiliklar belgisi bilan, «Hisobotlar» va «Sozlamalar» orasida", () => {
    const i = navItems.findIndex((item) => item.title === "Qo'llanma");
    expect(i).toBeGreaterThan(-1);
    const item = navItems[i];
    expect(item.url).toBe("/qollanma");
    // No gate = every staff member sees it; the guide filters its pages itself.
    expect(item.permission).toBeUndefined();
    expect(item.forRoles).toBeUndefined();
    expect(item.badgeKey).toBe("qollanma-yangiliklar");
    expect(navItems[i - 1]?.title).toBe("Hisobotlar");
    expect(navItems[i + 1]?.title).toBe("Sozlamalar");
  });
});

describe("navItems — «Guruhlar»", () => {
  // `GET /groups` kassirni rad etadi (groups.controller.ts): kassirga
  // ko'rsatilgan havola faqat 403 ga olib borardi.
  it("CEO, filial direktori, administrator va o'qituvchiga — kassirga emas", () => {
    const groups = navItems.find((item) => item.url === "/groups");
    expect(groups?.permission).toBe("groups.view");
  });
});

describe("navItems — Moliya → «Ish haqi»", () => {
  // Administrator oylikni ko'rmaydi: server ham `GET /salary/monthly` va
  // sahifaning boshqa o'qishlarini faqat CEO + filial direktoriga beradi.
  it("faqat CEO va filial direktoriga", () => {
    const salary = navItems
      .find((item) => item.url === "/payments")
      ?.children?.find((child) => child.url === "/payments/salary");
    expect(salary?.permission).toBe("salary.view");
  });
});

describe("navItems — Moliya → «Qarzdorlik» stays lit on its sub-pages (spec B2a §2.6)", () => {
  const debt = navItems
    .find((item) => item.url === "/payments")
    ?.children?.find((child) => child.url === "/payments/debt");

  it.each(["/payments/debt", "/payments/debt-history", "/payments/debt-write-offs"])(
    "%s highlights «Qarzdorlik»",
    (path) => {
      expect(debt && isNavChildActive(path, debt)).toBe(true);
    },
  );

  it("another Moliya page does not", () => {
    expect(debt && isNavChildActive("/payments/salary", debt)).toBe(false);
    // The frozen balances moved to «Qaytariladigan pul» (spec B2b §3.8).
    expect(debt && isNavChildActive("/payments/frozen-balances", debt)).toBe(false);
  });
});

describe("navItems — Moliya → «Qaytariladigan pul» (spec B2b §3)", () => {
  const children = navItems.find((item) => item.url === "/payments")?.children ?? [];
  const refunds = children.find((child) => child.url === "/payments/refunds");

  it("right after «Ish haqi», for every role that sees Moliya", () => {
    const i = children.findIndex((child) => child.url === "/payments/refunds");
    expect(children[i - 1]?.url).toBe("/payments/salary");
    expect(refunds?.title).toBe("Qaytariladigan pul");
    expect(refunds?.visibleForRoles).toEqual([1, 2, 3, 5]);
  });

  it("stays lit on its history page", () => {
    expect(refunds && isNavChildActive("/payments/refunds/history", refunds)).toBe(true);
  });
});

describe("navItems — every role sees the same menu as before capabilities", () => {
  // The menus each role saw when the menu was gated by role ids (2026-10-10).
  const BEFORE: Record<string, string[]> = {
    "1": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "2": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "3": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "4": ["/", "/schedule", "/groups", "/tasks", "/profile/salary", "/qollanma"],
    "5": ["/", "/schedule", "/tasks", "/payments", "/qollanma"],
  };

  it.each(Object.keys(BEFORE))("role %s", (role) => {
    const roleIds = [Number(role)];
    const can = canForRoles(roleIds);
    const visible = navItems
      .filter((item) => isNavGateOpen(item, can, roleIds))
      .map((item) => item.url);
    expect(visible).toEqual(BEFORE[role]);
  });
});
