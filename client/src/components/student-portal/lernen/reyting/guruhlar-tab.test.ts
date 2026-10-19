import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { GuruhlarSkelet, GuruhlarTab } from "./guruhlar-tab";
import type { GuruhQatori, Guruhlar } from "../types";

const q = (platz: number, o: Partial<GuruhQatori> = {}): GuruhQatori => ({
  groupId: `g-${platz}`,
  name: `A1-${100 + platz}`,
  baho: 30 - platz + 0.5,
  azolar: 12,
  platz,
  selbst: false,
  ...o,
});

function render(data: Guruhlar): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "guruhlar"], data);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(GuruhlarTab)));
}

describe("GuruhlarTab", () => {
  it("o'z guruhi 10 dan pastda — ajratuvchidan keyin, haqiqiy o'rni bilan", () => {
    const html = render({
      haftaBoshi: "2026-10-19",
      qatorlar: [...Array.from({ length: 10 }, (_, i) => q(i + 1)), q(14, { selbst: true, baho: 16.5 })],
      oz: { orin: 14, baho: 16.5, azolar: 12, nomi: "A1-114" },
      minAzolar: 3,
    });
    expect(html).toContain("A1-114");
    expect(html).toContain("···");
    expect(html).toContain("16,5 ball");
    expect(html).toContain(">14<");
    expect(html).not.toContain("jadvalga hali kirmaydi");
  });

  it("o'z guruhi 11-o'rinda — bo'shliq belgisi yo'q", () => {
    const html = render({
      haftaBoshi: "2026-10-19",
      qatorlar: [...Array.from({ length: 10 }, (_, i) => q(i + 1)), q(11, { selbst: true })],
      oz: { orin: 11, baho: 19.5, azolar: 12, nomi: "A1-111" },
      minAzolar: 3,
    });
    expect(html).toContain("A1-111");
    expect(html).not.toContain("···");
  });

  it("guruhsiz yoki kichik guruh — izoh", () => {
    const html = render({ haftaBoshi: "2026-10-19", qatorlar: [q(1)], oz: null, minAzolar: 3 });
    expect(html).toContain("Guruhingiz jadvalga hali kirmaydi (kamida 3 kishi kerak)");
  });

  it("skelet qator balandligini egallaydi", () => {
    expect(renderToStaticMarkup(createElement(GuruhlarSkelet))).toContain("h-[62px]");
  });
});
