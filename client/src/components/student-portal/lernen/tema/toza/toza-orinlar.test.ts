import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TozaMukofotFoni } from "./toza-mukofot-foni";
import { TozaUnitJoyi } from "./toza-unit-joyi";
import { TozaUnitLavha } from "./toza-unit-lavha";

describe("<TozaMukofotFoni />", () => {
  it("is a plain coral tint around the reward, whatever the result", () => {
    for (const bayram of [true, false]) {
      // `children` is the third argument (react/no-children-prop); the cast keeps `tsc`, which checks tests too,
      // from asking for it in the props.
      const html = renderToStaticMarkup(
        createElement(TozaMukofotFoni, { bayram } as ComponentProps<typeof TozaMukofotFoni>, "Dars tugadi!"),
      );
      expect(html).toContain("Dars tugadi!");
      expect(html).toContain("bg-coral-500/10");
    }
  });
});

describe("<TozaUnitLavha />", () => {
  const html = renderToStaticMarkup(createElement(TozaUnitLavha, { daraja: "A2", matn: "A2 · Wohnen" }));

  it("is the path's level-coloured banner with the unit's line", () => {
    expect(html).toContain("A2 · Wohnen");
    expect(html).toContain("bg-teal-700");
  });

  it("is read by screen readers (unlike the sticky path banner) and Dafi waves hello", () => {
    expect(html).not.toMatch(/^<div[^>]*aria-hidden/);
    expect(html).toContain('data-holat="salom"');
  });
});

describe("<TozaUnitJoyi />", () => {
  const joy = (over: Partial<Parameters<typeof TozaUnitJoyi>[0]>) =>
    renderToStaticMarkup(
      createElement(TozaUnitJoyi, {
        label: "Tanishuv",
        kind: "SECTION_A",
        holat: "active",
        tone: "coral",
        izoh: null,
        tartib: 0,
        onClick: () => {},
        onBosilmagan: () => {},
        ...over,
      }),
    );

  it("is the path's node card: «Boshlash» on the darker lip of the level colour, only on the current place", () => {
    expect(joy({})).toMatch(/text-white[^>]*style="background:color-mix\(in srgb, var\(--coral-500\) 72%, black\)">Boshlash</);
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("a locked place stays pressable but tells screen readers it is closed", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it("writes the words-left caption in the amber ink", () => {
    expect(joy({ holat: "done", izoh: "Yana mashq qilish · 14 yangi so'z" })).toMatch(
      /text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/,
    );
  });
});
