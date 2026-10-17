import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The menu content renders in a portal and only while open; draw it inline,
// keeping the two props the test reads (`value` of the group, `lang` of an item).
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuRadioGroup: ({ value, children }: { value?: string; children?: ReactNode }) =>
      createElement("div", { "data-value": value }, children),
    DropdownMenuRadioItem: ({ value, lang, children }: { value?: string; lang?: string; children?: ReactNode }) =>
      createElement("span", { "data-item": value, lang }, children),
  };
});
vi.mock("@/i18n/context", () => ({
  useT: () => (source: string) => source,
  useLocale: () => ({ locale: "ru", setLocale: async () => true }),
}));

import { LOCALES } from "@/i18n/locales";
import { LanguageMenu } from "./language-menu";

const html = renderToStaticMarkup(createElement(LanguageMenu)).replace(/&#x27;/g, "'");

describe("LanguageMenu", () => {
  it("names the current language on the button, in its own language", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Til: Русский"/);
    expect(html).toMatch(/<span lang="ru">Русский<\/span>/);
  });

  it("lists the five languages, each marked with its own lang", () => {
    for (const { id, label } of LOCALES) {
      expect(html).toContain(`<span data-item="${id}" lang="${id}">${label}</span>`);
    }
  });

  it("marks the current language as the group's value", () => {
    expect(html).toContain('data-value="ru"');
  });
});
