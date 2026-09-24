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
