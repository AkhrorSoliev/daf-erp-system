import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { YolTepasiSkelet } from "./yol-tepasi";

describe("YolTepasiSkelet", () => {
  it("to'rt belgi va maqsad kartasi o'rnini egallaydi — yuklangach yo'l sakramaydi", () => {
    const html = renderToStaticMarkup(createElement(YolTepasiSkelet));
    expect(html.match(/rounded-pill/g)).toHaveLength(4);
    // Yuklangan karta 81 px (+ 12 px oraliq): skelet ham shuncha joy oladi.
    expect(html).toContain("h-[81px]");
    expect(html).toContain("space-y-3");
  });
});
