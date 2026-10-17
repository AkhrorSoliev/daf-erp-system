import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { interpolate } from "@/i18n/translate";

// The buttons read their `t` from the language context, like every translated
// component; the test picks which `t` that is.
const hook = vi.hoisted(() => ({ t: undefined as undefined | ((s: string, p?: Record<string, string | number>) => string) }));
vi.mock("@/i18n/context", () => ({ useT: () => hook.t }));

import { UnmarkedLessonButtons } from "./unmarked-lesson-prompt";

const state = { visible: true, canAnswer: true, heldBy: "Ali Valiyev", canExempt: false };
const render = () => renderToStaticMarkup(createElement(UnmarkedLessonButtons, { state, onPick: () => undefined }));

describe("UnmarkedLessonButtons", () => {
  it("reads the Uzbek source when the language is Uzbek (also what a page without a provider gets)", () => {
    hook.t = interpolate;
    const html = render();
    expect(html).toContain("Dars bo&#x27;ldimi?");
    expect(html).toContain("Ali Valiyev javob bermoqda");
    expect(html).toContain("Bo&#x27;ldi");
    expect(html).toContain("Bo&#x27;lmadi");
  });

  it("draws the texts through the page's t, the name filled in as data", () => {
    hook.t = (source, params) => `[${interpolate(source, params)}]`;
    const html = render();
    expect(html).toContain("[Dars bo&#x27;ldimi?]");
    expect(html).toContain("[Ali Valiyev javob bermoqda]");
    expect(html).toContain("[Bo&#x27;ldi]");
    expect(html).toContain("[Bo&#x27;lmadi]");
  });
});
