import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The bottom nav decides the current tab from the pathname; the pages only
// need a router object to exist. Everything else renders for real.
const nav = vi.hoisted(() => ({ pathname: "/portal" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
}));

import { studentNavItems } from "@/lib/student-nav-items";
import { LumioBottomNav } from "./lumio/bottom-nav";
import { StudentMoreHub } from "./student-more-hub";
import { StudentAttendanceHistory } from "./student-attendance-history";
import { StudentRadioPage } from "./student-radio-page";
import { StudentSettingsPage } from "./student-settings-page";
import { StudentFaqPage } from "./student-faq-page";
import { StudentAboutPage } from "./student-about-page";
import { StudentProfilePage } from "./student-profile-page";
import { LernenLevelsPage } from "./lernen/lernen-levels-page";
import { StudentScheduleView } from "./student-schedule-view";
import { StudentPaymentSummary } from "./student-payment-summary";

function render(component: ComponentType, pathname = "/portal"): string {
  nav.pathname = pathname;
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(component)),
  );
}

/** Every `<a>` in the markup as { href, current }. */
function links(html: string): { href: string; current: boolean }[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => ({
    href: tag.match(/\bhref="([^"]*)"/)?.[1] ?? "",
    current: /\baria-current="page"/.test(tag),
  }));
}

describe("portal navigation on a phone", () => {
  // Production finding (2026-09): Ta'lim was added to the nav config, but the
  // Ko'proq hub kept its own hand-written menu, so a phone had no way in at
  // all, while To'lovlar showed up both as a tab and as a hub row.
  it("reaches every destination exactly once, from a tab or a Ko'proq row", () => {
    const reachable = [
      ...links(render(LumioBottomNav)),
      ...links(render(StudentMoreHub, "/portal/more")),
    ].map((l) => l.href);

    for (const item of studentNavItems) {
      if (item.url === "/portal/more") continue; // the hub's own tab
      expect(
        reachable.filter((href) => href === item.url),
        `${item.title} (${item.url})`,
      ).toHaveLength(1);
    }
  });

  // Deliberate friction, like settings-nav.test.ts: which screens get a tab is
  // a product decision, so changing it should mean changing this list.
  it("puts the daily destinations on the tab bar", () => {
    expect(links(render(LumioBottomNav)).map((l) => l.href)).toEqual([
      "/portal",
      "/portal/lernen",
      "/portal/schedule",
      "/portal/payments",
      "/portal/more",
    ]);
  });

  it.each([
    ["/portal", "/portal"],
    ["/portal/lernen", "/portal/lernen"],
    ["/portal/lernen/units/5", "/portal/lernen"],
    ["/portal/lernen/reyting", "/portal/lernen"],
    ["/portal/schedule", "/portal/schedule"],
    ["/portal/payments", "/portal/payments"],
    ["/portal/payments/result", "/portal/payments"],
    ["/portal/more", "/portal/more"],
    ["/portal/profile", "/portal/more"],
    ["/portal/attendance", "/portal/more"],
    ["/portal/radio", "/portal/more"],
    ["/portal/settings", "/portal/more"],
    ["/portal/faq", "/portal/more"],
    ["/portal/about", "/portal/more"],
  ])("on %s lights exactly the %s tab", (pathname, tab) => {
    const current = links(render(LumioBottomNav, pathname)).filter(
      (l) => l.current,
    );
    expect(current.map((l) => l.href)).toEqual([tab]);
  });

  // The tab a student taps and the title they land on must name the same
  // place: the Ta'lim tab used to open a screen titled "Darslar", the word the
  // home screen uses for classes at the center. Asosiy is the exception; it
  // greets the student by name.
  it.each([
    ["Ta'lim", LernenLevelsPage],
    ["Jadval", StudentScheduleView],
    ["To'lovlar", StudentPaymentSummary],
    ["Ko'proq", StudentMoreHub],
  ] as const)("titles the %s tab's screen with the tab's own name", (label, page) => {
    const h1 = render(page).match(/<h1\b[^>]*>([^<]*)<\/h1>/)?.[1];
    expect(h1?.replace(/&#x27;/g, "'")).toBe(label);
  });

  // A Ko'proq row opens a screen that is not a tab, so on a phone that screen
  // is the only thing between the student and the hub they came from.
  it.each([
    ["Davomat", StudentAttendanceHistory],
    ["Radio", StudentRadioPage],
    ["Sozlamalar", StudentSettingsPage],
    ["FAQ", StudentFaqPage],
    ["Biz haqimizda", StudentAboutPage],
    ["Profil", StudentProfilePage],
  ] as const)("gives the %s screen a back button", (_title, page) => {
    expect(render(page)).toContain('aria-label="Orqaga"');
  });
});
