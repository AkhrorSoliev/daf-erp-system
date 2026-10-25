import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KonfetiTuval } from "./konfeti-tuval";

describe("<KonfetiTuval />", () => {
  it("is a full-screen canvas that never catches a tap and is hidden from screen readers", () => {
    const html = renderToStaticMarkup(createElement(KonfetiTuval));
    expect(html).toContain("<canvas");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("fixed inset-0");
  });
});
