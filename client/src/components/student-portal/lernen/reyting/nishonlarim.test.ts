import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { Nishonlarim } from "./nishonlarim";
import type { NishonQatori } from "../types";

function render(rows: NishonQatori[]): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "nishonlar"], rows);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Nishonlarim)),
  );
}

describe("Nishonlarim", () => {
  it("olingan to'la, olinmagan chiziqli ramkada «yana N»", () => {
    const html = render([
      { key: "SERIE_3", tur: "SERIE", chegara: 3, olingan: "2026-10-18T07:00:00.000Z", qoldi: null },
      { key: "SERIE_7", tur: "SERIE", chegara: 7, olingan: null, qoldi: 3 },
      { key: "WOERTER_50", tur: "WOERTER", chegara: 50, olingan: null, qoldi: 12 },
    ]);
    expect(html).toContain("Nishonlarim");
    expect(html).toContain("3 kun ketma-ket");
    expect(html).toContain("yana 3 kun");
    expect(html).toContain("yana 12 ta so&#x27;z");
    expect(html.match(/border-dashed/g)).toHaveLength(2);
  });

  it("ekranda inglizcha so'z yo'q", () => {
    const html = render([
      { key: "SERIE_3", tur: "SERIE", chegara: 3, olingan: null, qoldi: 1 },
    ]);
    expect(html).not.toMatch(/badge|streak|serie\b/i);
  });

  it("musobaqa nishoni — o'z nomi va to'q binafsha to'ldirish (oq matn)", () => {
    const html = render([
      { key: "LIGA_KUMUSH", tur: "LIGA", chegara: 1, olingan: "2026-10-19T07:00:00.000Z", qoldi: null },
      { key: "XONA_GOLIB", tur: "XONA", chegara: 1, olingan: null, qoldi: 1 },
    ]);
    expect(html).toContain("Kumush ligasi");
    expect(html).toContain("bg-grape-500 text-white");
    expect(html).toContain("Xonada 1-o&#x27;rin, kamida 50 ball");
  });
});
