import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The store's static state is "nothing known", so the held capabilities are
// supplied through a mock.
const held = vi.hoisted(() => ({ keys: [] as string[] }));
vi.mock("@/hooks/use-permissions", () => ({
  useCan: (wanted: string | readonly string[]) =>
    (typeof wanted === "string" ? [wanted] : wanted).some((k) =>
      held.keys.includes(k),
    ),
}));

import { CanLink } from "./can-link";

function render(keys: string[]): string {
  held.keys = keys;
  return renderToStaticMarkup(
    createElement(
      CanLink,
      {
        perm: "groups.view",
        href: "/groups/7",
        className: "block",
        linkClassName: "hover:underline",
        "aria-label": "Guruhni ochish",
      },
      "A1-guruh",
    ),
  );
}

describe("CanLink", () => {
  it("gives a viewer who may open the page a link with its hover class and label", () => {
    const html = render(["groups.view"]);
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/groups/7"');
    expect(html).toContain('class="block hover:underline"');
    expect(html).toContain('aria-label="Guruhni ochish"');
  });

  it("gives everyone else the same text without a link", () => {
    expect(render(["payments.view"])).toBe('<span class="block">A1-guruh</span>');
  });
});
