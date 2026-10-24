import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "./lumio/input";
import { LanguagePicker } from "./lumio/language-picker";

// The portal's language lives on the device only (no account language for
// students): no LocaleSync, and every language change is `{ save: false }`.
const SRC = path.resolve(__dirname, "..", "..");
const PORTAL_SOURCES = [
  "components/student-portal",
  "app/(student-portal)",
  "app/(auth)/login/page.tsx",
  "app/(auth)/login/student-login-form.tsx",
];

function walk(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target).flatMap((name) => walk(path.join(target, name)));
}

const sources = PORTAL_SOURCES.flatMap((p) => walk(path.join(SRC, p)))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("student portal language", () => {
  it("never mounts LocaleSync nor the staff picker", () => {
    expect(sources.length).toBeGreaterThan(50);
    const offenders = sources
      .filter(({ text }) => /i18n\/locale-sync|LocaleSync|language-radio-group/.test(text.replace(/\/\/.*$/gm, "")))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("passes { save: false } to every setLocale call", () => {
    const calls = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/\bsetLocale\(([^)]*)\)/g)].map((m) => `${file}: ${m[0]}`),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => !c.includes("{ save: false }"))).toEqual([]);
  });

  it("stays Uzbek outside a provider", () => {
    const picker = renderToStaticMarkup(createElement(LanguagePicker));
    expect(picker).toContain('aria-label="Til"');
    expect(picker).toMatch(/aria-checked="true" lang="uz"/);
    const input = renderToStaticMarkup(createElement(Input, { type: "password" }));
    expect(input).toContain("aria-label=\"Parolni ko&#x27;rsatish\"");
  });
});
