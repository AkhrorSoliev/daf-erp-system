import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { EslatmalarQatori } from "./eslatmalar-qatori";
import type { Fortschritt } from "../types";

function render(f: Partial<Fortschritt>): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "fortschritt"], f as Fortschritt);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(EslatmalarQatori)),
  );
}

const matni = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("EslatmalarQatori", () => {
  it("yoqilgan: almashtirgich yoqiq va faol, izoh bilan", () => {
    const html = render({ eslatmalar: true, telegramUlangan: true });
    expect(html).toContain("Telegram eslatmalari");
    expect(html).toContain("Kechki eslatma va dushanba xulosasi");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('disabled=""');
  });

  it("o'chirilgan: almashtirgich o'chiq, faol", () => {
    const html = render({ eslatmalar: false, telegramUlangan: true });
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('disabled=""');
  });

  it("botga ulanmagan: «Botga ulang», almashtirgich faol emas", () => {
    const html = render({ eslatmalar: true, telegramUlangan: false });
    expect(html).toContain("Botga ulang");
    expect(html).not.toContain("Kechki eslatma va dushanba xulosasi");
    expect(html).toContain('disabled=""');
  });

  it("eski server (maydonlar yo'q) — hech narsa chizilmaydi", () => {
    expect(render({ gesamt: 10 })).toBe("");
  });

  it("ekranda inglizcha so'z yo'q", () => {
    expect(matni(render({ eslatmalar: true, telegramUlangan: true }))).not.toMatch(
      /\b(reminder|notification|on|off|switch)\b/i,
    );
  });

  it("a11y: nomi sarlavhadan, izohga aria-describedby bilan bog'langan", () => {
    for (const ulangan of [true, false]) {
      const html = render({ eslatmalar: true, telegramUlangan: ulangan });
      expect(html).toContain('aria-labelledby="eslatmalar-sarlavha"');
      expect(html).toContain('id="eslatmalar-sarlavha"');
      expect(html).toContain('aria-describedby="eslatmalar-izoh"');
      expect(html).toContain('id="eslatmalar-izoh"');
    }
  });
});
