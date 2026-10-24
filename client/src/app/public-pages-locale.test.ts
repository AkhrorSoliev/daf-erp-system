import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/context";
import de from "@/i18n/dictionaries/de";
import en from "@/i18n/dictionaries/en";
import ru from "@/i18n/dictionaries/ru";
import { LOCALES } from "@/i18n/locales";
import { LanguagePicker, pickPortalLocale } from "@/components/student-portal/lumio/language-picker";
import { ReceiptView, type VerificationDto } from "./r/[id]/receipt-view";
import { CertificateView } from "./t/[id]/certificate-view";
import type { VerifyDto } from "./t/[id]/load-verify";

// The public pages (receipt /r, certificate /t, form /f) have no login: the
// language lives on the device only (ADR-0120), exactly as in the student portal.
const SRC = path.resolve(__dirname, "..");
const PUBLIC_SOURCES = [
  "app/r",
  "app/t",
  "app/f",
  "components/forms/public-form-renderer.tsx",
  "components/forms/public-form-fields.tsx",
  "components/public-page-i18n.tsx",
];

function walk(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target).flatMap((name) => walk(path.join(target, name)));
}

const sources = PUBLIC_SOURCES.flatMap((p) => walk(path.join(SRC, p)))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8").replace(/\/\/.*$/gm, "") }));

const read = (file: string) => readFileSync(path.join(SRC, file), "utf8");

describe("public pages language", () => {
  it("never saves the language: no LocaleSync, no staff picker, no api client, no setLocale of their own", () => {
    expect(sources.length).toBeGreaterThan(10);
    const offenders = sources
      .filter(({ text }) =>
        /i18n\/locale-sync|LocaleSync|language-radio-group|ui-locale|@\/lib\/api["']|\bsetLocale\(/.test(text),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("every public layout reads the device cookie and shows the neutral picker", () => {
    for (const layout of ["app/r/layout.tsx", "app/t/layout.tsx", "app/f/layout.tsx"]) {
      const text = read(layout);
      expect(text, layout).toContain("<PublicPageI18n>");
      expect(text, layout).toMatch(/<LanguagePicker variant="plain"/);
    }
    const provider = read("components/public-page-i18n.tsx");
    expect(provider).toContain("await currentLocale()");
    expect(provider).toContain("languageBootScript(locale)");
  });

  it("a pick switches the device language without saving it", () => {
    const setLocale = vi.fn(async () => true);
    pickPortalLocale("en", "uz", setLocale);
    expect(setLocale).toHaveBeenCalledWith("en", { save: false });
  });

  it("the plain picker is Uzbek outside a provider and uses no Lumio token", () => {
    const html = renderToStaticMarkup(createElement(LanguagePicker, { variant: "plain" })).replace(/&#x27;/g, "'");
    expect(html).toMatch(/<select aria-label="Til"/);
    for (const { id, label } of LOCALES) {
      const selected = id === "uz" ? ' selected=""' : "";
      expect(html).toContain(`<option value="${id}" lang="${id}"${selected}>${label}</option>`);
    }
    expect(html).not.toMatch(/ink-|bg-surface|border-line|coral|shadow-lumio|font-display/);
  });

  it("the receipt stays Uzbek outside a provider and prints the data as sent", () => {
    const data: VerificationDto = {
      kind: "payment",
      receiptCode: "KV-0001",
      reversed: false,
      reversedReason: null,
      amount: 1500000,
      currency: "UZS",
      date: "2026-10-01T07:00:00.000Z",
      studentName: "Ali Valiyev",
      studentId: 10001,
      groupName: "A1-01",
      branchName: null,
      companyName: "DaF Sprachzentrum",
      receivedByName: "Kassir",
      pdfUrl: "https://example.test/r.pdf",
    };
    const html = renderToStaticMarkup(createElement(ReceiptView, { data })).replace(/&#x27;/g, "'");
    expect(html).toContain("Bu hujjat haqiqiy");
    expect(html).toContain("Kvitansiya № KV-0001");
    expect(html).toMatch(/1\s500\s000 so'm/);
    expect(html).toContain("Ali Valiyev (10001)");
    expect(html).toContain("01.10.2026 12:00");
  });
});

// A trust page must never read as genuine for a cancelled document, in any language.
describe("public pages verdict", () => {
  const DICTS = { ru, de, en } as const;
  const GENUINE_WORD = { ru: "подлинный", de: "echt", en: "genuine" } as const;
  const inLocale = (locale: keyof typeof DICTS, el: ReactElement) =>
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        { initialLocale: locale, initialDictionary: DICTS[locale] } as ComponentProps<typeof I18nProvider>,
        el,
      ),
    );
  // The verdict line is the first text after the status icon.
  const verdict = (html: string) => html.match(/<div class="text-base font-semibold">([^<]*)<\/div>/)?.[1] ?? "";

  const cert: VerifyDto = {
    valid: true,
    revoked: false,
    number: "T-0001",
    studentName: "Ali Valiyev",
    level: "A1",
    from: "2026-05-01",
    to: "2026-08-31",
    issuedAt: "2026-09-01T07:00:00.000Z",
    companyName: "DaF Sprachzentrum",
  };
  const receipt: VerificationDto = {
    kind: "payment",
    receiptCode: "KV-0001",
    reversed: false,
    reversedReason: null,
    amount: 1000,
    currency: "UZS",
    date: "2026-10-01T07:00:00.000Z",
    studentName: "Ali Valiyev",
    studentId: 10001,
    groupName: null,
    branchName: null,
    companyName: "DaF Sprachzentrum",
    receivedByName: null,
    pdfUrl: "https://example.test/r.pdf",
  };

  for (const locale of ["ru", "de", "en"] as const) {
    it(`${locale}: a revoked certificate and a reversed receipt never read as genuine`, () => {
      const pairs = [
        [
          inLocale(locale, createElement(CertificateView, { data: cert })),
          inLocale(locale, createElement(CertificateView, { data: { ...cert, valid: false, revoked: true } })),
        ],
        [
          inLocale(locale, createElement(ReceiptView, { data: receipt })),
          inLocale(locale, createElement(ReceiptView, { data: { ...receipt, reversed: true, reversedReason: "x" } })),
        ],
      ];
      for (const [okHtml, cancelledHtml] of pairs) {
        const ok = verdict(okHtml);
        const cancelled = verdict(cancelledHtml);
        expect(ok).toContain(GENUINE_WORD[locale]);
        expect(cancelled).not.toBe("");
        expect(cancelled).not.toBe(ok);
        expect(cancelled.toLowerCase()).not.toContain(GENUINE_WORD[locale]);
      }
    });
  }
});
