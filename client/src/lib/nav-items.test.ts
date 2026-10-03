import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

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
    // visibleForRoles yo'q = hamma xodim ko'radi; sahifalar rolga qarab filtrlanadi.
    expect(item.visibleForRoles).toBeUndefined();
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
    expect(groups?.visibleForRoles).toEqual([1, 2, 3, 4]);
  });
});

describe("navItems — Moliya → «Ish haqi»", () => {
  // Administrator oylikni ko'rmaydi: server ham `GET /salary/monthly` va
  // sahifaning boshqa o'qishlarini faqat CEO + filial direktoriga beradi.
  it("faqat CEO va filial direktoriga", () => {
    const salary = navItems
      .find((item) => item.url === "/payments")
      ?.children?.find((child) => child.url === "/payments/salary");
    expect(salary?.visibleForRoles).toEqual([1, 2]);
  });
});
