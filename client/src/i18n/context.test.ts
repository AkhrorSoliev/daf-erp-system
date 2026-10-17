import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider, useLocale, useT } from "./context";

function Probe() {
  const t = useT();
  const { locale } = useLocale();
  return createElement("p", null, `${locale}|${t("Bosh sahifa")}|${t("{n} ta o'quvchi", { n: 2 })}`);
}

// renderToStaticMarkup escapes the apostrophe as &#x27;; read the text back.
const unescape = (html: string) => html.replace(/&#x27;/g, "'");

const render = (initialLocale: Parameters<typeof I18nProvider>[0]["initialLocale"], initialDictionary: Record<string, string>) =>
  unescape(
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        // `children` is the third argument (react/no-children-prop).
        { initialLocale, initialDictionary } as ComponentProps<typeof I18nProvider>,
        createElement(Probe),
      ),
    ),
  );

describe("I18nProvider, useT, useLocale", () => {
  it("translates from the dictionary it was given", () => {
    expect(render("ru", { "Bosh sahifa": "Главная", "{n} ta o'quvchi": "{n} учеников" })).toContain("ru|Главная|2 учеников");
  });

  it("transliterates for uz-Cyrl", () => {
    expect(render("uz-Cyrl", {})).toContain("uz-Cyrl|Бош саҳифа|2 та ўқувчи");
  });

  it("shows the Uzbek source without a translation", () => {
    expect(render("de", {})).toContain("de|Bosh sahifa|2 ta o'quvchi");
  });

  it("behaves as Uzbek outside a provider", () => {
    expect(unescape(renderToStaticMarkup(createElement(Probe)))).toContain("uz|Bosh sahifa|2 ta o'quvchi");
  });

  it("cannot switch the language outside a provider: setLocale resolves false", async () => {
    // A server render only draws, so the probe calls `setLocale` while drawing
    // and keeps the promise in `answers` for the test to await.
    const answers: Promise<boolean>[] = [];
    function SetLocaleProbe() {
      const { setLocale } = useLocale();
      answers.push(setLocale("ru"));
      return null;
    }
    renderToStaticMarkup(createElement(SetLocaleProbe));
    expect(answers).toHaveLength(1);
    await expect(answers[0]).resolves.toBe(false);
  });
});
