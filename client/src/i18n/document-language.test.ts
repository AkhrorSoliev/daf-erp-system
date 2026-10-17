import { describe, expect, it } from "vitest";
import { bindDocumentLanguage, languageBootScript } from "./document-language";
import { LOCALE_IDS } from "./locales";

/** Runs the inline script against a fake document and returns what it left on <html lang>. */
function run(script: string): string {
  const doc = { documentElement: { lang: "uz" } };
  new Function("document", script)(doc);
  return doc.documentElement.lang;
}

describe("languageBootScript", () => {
  it.each(LOCALE_IDS)("sets <html lang> to %s", (id) => {
    expect(run(languageBootScript(id))).toBe(id);
  });

  it("quotes the id as a string literal", () => {
    expect(languageBootScript("uz-Cyrl")).toBe('document.documentElement.lang="uz-Cyrl"');
  });
});

describe("bindDocumentLanguage", () => {
  it("sets the language and its cleanup puts Uzbek back", () => {
    const root = { lang: "uz" };
    const cleanup = bindDocumentLanguage(root, "ru");
    expect(root.lang).toBe("ru");
    cleanup();
    expect(root.lang).toBe("uz");
  });

  it("ends on the right language after a strict-mode double run", () => {
    const root = { lang: "uz" };
    bindDocumentLanguage(root, "de")(); // first run, cleaned up at once
    const cleanup = bindDocumentLanguage(root, "de"); // the real run
    expect(root.lang).toBe("de");
    cleanup();
    expect(root.lang).toBe("uz");
  });

  it("a language change cleans up the old one before the new one lands", () => {
    const root = { lang: "uz" };
    const cleanup = bindDocumentLanguage(root, "en");
    cleanup();
    bindDocumentLanguage(root, "uz-Cyrl");
    expect(root.lang).toBe("uz-Cyrl");
  });
});
