import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunBelgisiProps } from "../tema-turlari";
import { OrmonTugun } from "./ormon-tugun";

const render = (p: Partial<TugunBelgisiProps>) =>
  renderToStaticMarkup(
    createElement(OrmonTugun, { label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {}, ...p }),
  );

describe("<OrmonTugun />", () => {
  it("the current node is a lit orb with a ring, pressable and named by its section", () => {
    const html = render({});
    expect(html).toContain('data-tugun="ormon"');
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).toContain("ormon-ring");
    expect(html).not.toContain("aria-disabled");
  });

  it("the current orb stands out on its own, for when «Kam harakat» hides the ring", () => {
    const orb = /<button[^>]*>/.exec(render({}))?.[0] ?? "";
    expect(orb).toContain("#4fcdb3");
    expect(orb).toContain("rgba(166, 253, 232, 0.67)");
    expect(orb).not.toBe(/<button[^>]*>/.exec(render({ holat: "done" }))?.[0]);
  });

  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = render({ holat: "locked", onClick: undefined, onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).not.toContain("ormon-ring");
  });

  it("a finished node is the gold orb, whatever the level colour", () => {
    expect(render({ holat: "done", tone: "teal" })).toBe(render({ holat: "done", tone: "grape" }));
    expect(render({ holat: "done" })).toContain("#f2cd7a");
  });

  it("writes its name on a plain surface pill in the darkest ink, readable over any part of the scene", () => {
    const html = render({});
    expect(html).toMatch(/bg-surface[^"]*text-ink-900[^"]*">Tanishuv</);
    expect(html).not.toMatch(/\btext-ink-(?:400|500)\b/);
    expect(html).not.toContain("backdrop-");
  });
});
