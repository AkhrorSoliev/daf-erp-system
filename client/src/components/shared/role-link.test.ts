import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Zustand do'koni statik renderda boshlang'ich holatni (user: null) beradi,
// shuning uchun kirgan foydalanuvchining rollari mock orqali beriladi.
const auth = vi.hoisted(() => ({ roleIds: [] as number[] }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: (
    select: (s: { user: { roles: { id: number }[] } }) => unknown,
  ) => select({ user: { roles: auth.roleIds.map((id) => ({ id })) } }),
}));

import { RoleLink } from "./role-link";
import { GROUP_PAGE_ROLES } from "@/lib/role-access";

function render(roleIds: number[]): string {
  auth.roleIds = roleIds;
  return renderToStaticMarkup(
    createElement(
      RoleLink,
      {
        roles: GROUP_PAGE_ROLES,
        href: "/groups/7",
        className: "block",
        linkClassName: "hover:underline",
        "aria-label": "Guruhni ochish",
      },
      "A1-guruh",
    ),
  );
}

describe("RoleLink", () => {
  it("sahifani ocha oladigan rolga — havola, hover klassi va aria-label bilan", () => {
    const html = render([4]);
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/groups/7"');
    expect(html).toContain('class="block hover:underline"');
    expect(html).toContain('aria-label="Guruhni ochish"');
  });

  it("ocholmaydigan rolga — o'sha matn havolasiz, hover va aria-label'siz", () => {
    expect(render([5])).toBe('<span class="block">A1-guruh</span>');
  });
});
