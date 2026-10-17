import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnmarkedLessonButtons } from "./unmarked-lesson-prompt";

const state = { visible: true, canAnswer: true, heldBy: "Ali Valiyev", canExempt: false };

describe("UnmarkedLessonButtons", () => {
  it("reads the Uzbek source when no t is given (pages that are not translated)", () => {
    const html = renderToStaticMarkup(createElement(UnmarkedLessonButtons, { state, onPick: () => undefined }));
    expect(html).toContain("Dars bo&#x27;ldimi?");
    expect(html).toContain("Ali Valiyev javob bermoqda");
    expect(html).toContain("Bo&#x27;ldi");
    expect(html).toContain("Bo&#x27;lmadi");
  });

  it("draws the texts through the given t, the name filled in as data", () => {
    const t = (source: string, params?: Record<string, string | number>) =>
      `[${source.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k]))}]`;
    const html = renderToStaticMarkup(createElement(UnmarkedLessonButtons, { state, onPick: () => undefined, t }));
    expect(html).toContain("[Dars bo&#x27;ldimi?]");
    expect(html).toContain("[Ali Valiyev javob bermoqda]");
    expect(html).toContain("[Bo&#x27;ldi]");
    expect(html).toContain("[Bo&#x27;lmadi]");
  });
});
