import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartedPending } from "./departed-pending";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const GRACE = { LEFT_GROUP: 21, FROZEN: 60 };

describe("DepartedPending", () => {
  it("the amber block with the two waiting periods and a link to the outreach centre", () => {
    const html = renderToStaticMarkup(createElement(DepartedPending, { count: 21, graceDays: GRACE }));
    const text = norm(html);
    expect(text).toContain("Hali qaytishi mumkin · bugungi holat");
    expect(text).toContain("21 o'quvchi — guruhdan chiqqaniga 21 kun yoki muzlatilganiga 60 kun to'lmagan. Qaytmasa, «ketgan» hisoblanadi.");
    expect(text).toContain("Aloqa markaziga");
    expect(html).toContain('href="/outreach"');
    expect(html).toContain("bg-amber-500/10");
    expect(html).toContain("lucide-phone-call size-4");
  });
  it("nobody waiting: nothing is drawn", () => {
    expect(renderToStaticMarkup(createElement(DepartedPending, { count: 0, graceDays: GRACE }))).toBe("");
  });
});
