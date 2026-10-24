import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DatePicker } from "./date-picker";

describe("DatePicker without a language provider", () => {
  // The student portal and the public form have no provider: they keep Uzbek.
  it("shows the Uzbek default placeholder", () => {
    const html = renderToStaticMarkup(createElement(DatePicker, {}));
    expect(html).toContain("Sanani tanlang");
  });

  it("keeps its own placeholder when a caller passes one", () => {
    const html = renderToStaticMarkup(createElement(DatePicker, { placeholder: "Boshlanish sanasi" }));
    expect(html).toContain("Boshlanish sanasi");
    expect(html).not.toContain("Sanani tanlang");
  });

  // The public form (/f/[slug]) has no login: the picker must not pull the
  // sign-in machinery in through the language context.
  it("imports the light i18n module, not the provider", () => {
    const picker = readFileSync(new URL("./date-picker.tsx", import.meta.url), "utf8");
    expect(picker).toContain('"@/i18n/use-t"');
    expect(picker).not.toContain('"@/i18n/context"');
    const useT = readFileSync(new URL("../../i18n/use-t.ts", import.meta.url), "utf8");
    expect(useT).not.toMatch(/from "@\/lib\/api"|use-auth|react-hot-toast|js-cookie|axios/);
  });
});
