import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The menu content renders in a portal and only while open; draw it inline.
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuRadioGroup: Pass,
    DropdownMenuRadioItem: Pass,
    DropdownMenuSeparator: Pass,
    DropdownMenuSub: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuSubTrigger: Pass,
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: () => {} }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => () => {} }));
// zustand v5 hands a server render (renderToStaticMarkup) the store's INITIAL
// state, so a real `useAuth.setState` would never reach the component here.
vi.mock("@/hooks/use-auth", () => {
  const state: { user: unknown } = { user: null };
  const useAuth = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state,
    setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
    subscribe: () => () => {},
  });
  return { useAuth };
});
vi.mock("@/hooks/use-ui-skin", () => ({
  useUiSkin: () => ({ skin: "ormon", setSkin: async () => true }),
}));

import { useAuth } from "@/hooks/use-auth";
import { HeaderUserMenu } from "./header-user-menu";

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

type AuthUser = NonNullable<ReturnType<typeof useAuth.getState>["user"]>;
const signedIn = {
  id: 10001,
  firstName: "Ali",
  lastName: "Valiyev",
  photo: null,
  roles: [{ id: 2, name: "Branch Director" }],
} as unknown as AuthUser;

describe("HeaderUserMenu", () => {
  beforeEach(() => useAuth.setState({ user: signedIn }));

  it("shows who is signed in and offers Profil, Ko'rinish and Chiqish", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    const text = norm(html);
    expect(text).toContain("Ali Valiyev");
    expect(text).toContain("Branch Director");
    expect(text).toContain("Profil");
    expect(text).toContain("Ko'rinish");
    expect(text).toContain("Yorug'");
    expect(text).toContain("Qorong'i");
    expect(text).toContain("Tizim");
    expect(text).toContain("Chiqish");
    expect(html).toContain('href="/profile"');
  });

  it("hides the name below lg so a phone or tablet shows the picture only", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    expect(html).toMatch(/class="hidden max-w-40 truncate text-sm font-medium lg:block"/);
  });

  it("labels the trigger with the user's name", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    expect(html).toContain('aria-label="Ali Valiyev"');
  });

  it("offers the five design skins and marks the current one", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    const text = norm(html);
    expect(text).toContain("Dizayn uslubi");
    for (const name of ["Daftar", "O'rmon", "Gilos", "Grafit", "Qum"]) {
      expect(text).toContain(name);
    }
    // the colour dots come from the registry
    for (const swatch of ["#1b2d4e", "#1f4d3a", "#6b2233", "#2f3640", "#6b4a1e"]) {
      expect(html).toContain(swatch);
    }
  });

  it("draws no menu items before the session is hydrated", () => {
    useAuth.setState({ user: null });
    const text = norm(renderToStaticMarkup(createElement(HeaderUserMenu)));
    expect(text).not.toContain("Profil");
    expect(text).not.toContain("Chiqish");
  });
});
