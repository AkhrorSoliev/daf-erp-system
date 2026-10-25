import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TozaTugun } from "./toza-tugun";

const render = (props: Parameters<typeof TozaTugun>[0]) => renderToStaticMarkup(createElement(TozaTugun, props));

describe("<TozaTugun />", () => {
  it("the current node can be pressed and is named by the section", () => {
    const html = render({ label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {} });
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).not.toContain("disabled");
  });
  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = render({ label: "Tanishuv", holat: "locked", tone: "coral", onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });
});
