import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { COMPANY } from "@/lib/company";
import { SidebarFooterInfo } from "./sidebar-footer-info";

afterEach(() => vi.unstubAllEnvs());

const draw = () =>
  renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(SidebarProvider, null, createElement(SidebarFooterInfo)),
    ),
  );

describe("SidebarFooterInfo", () => {
  it("links to technical support in a new tab", () => {
    const html = draw();
    expect(html).toContain(`href="${COMPANY.supportHref}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Texnik yordam");
  });

  it("prints the build date and commit, and hides the line on an icon-only sidebar", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "2026-10-17");
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "a1b2c3d");
    const html = draw();
    expect(html).toContain("Yangilangan: 17.10.2026 · a1b2c3d");
    expect(html).toContain("group-data-[collapsible=icon]:hidden");
  });

  it("omits the build line when there is no build date", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "");
    expect(draw()).not.toContain("Yangilangan");
  });
});
