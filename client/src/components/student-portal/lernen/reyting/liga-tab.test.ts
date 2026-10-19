import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { LigaSkelet, LigaTab } from "./liga-tab";
import type { Liga, ReytingZeile } from "../types";

const qator = (platz: number, o: Partial<ReytingZeile> = {}): ReytingZeile => ({
  studentId: 100 + platz,
  name: `Talaba ${platz}`,
  punkte: 200 - platz,
  platz,
  selbst: false,
  ...o,
});

const liga = (o: Partial<Liga> = {}): Liga => ({
  haftaBoshi: "2026-10-19",
  haftaOxiri: "2026-10-25",
  azo: true,
  daraja: { tier: 1, nomi: "Kumush" },
  xona: {
    raqam: 3,
    hajmi: 16,
    qatorlar: Array.from({ length: 16 }, (_, i) => qator(i + 1, i === 6 ? { selbst: true } : {})),
    kotarilishZonasi: { soni: 5, faol: true },
  },
  otganHafta: null,
  ...o,
});

function render(data: Liga): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "liga"], data);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LigaTab)));
}

describe("LigaTab", () => {
  it("ko'tarilish zonasi: birinchi 5 tasi yashil, o'z qatori ajratilgan, hajm", () => {
    const html = render(liga());
    expect(html).toContain("Kumush ligasi");
    expect(html).toContain("Birinchi 5 tasi, kamida 50 ball topgan bo&#x27;lsa, ko&#x27;tariladi");
    expect(html.match(/bg-success\/10/g)).toHaveLength(5);
    expect(html.match(/border-coral-500/g)).toHaveLength(1);
    expect(html).toContain("16 kishi");
  });

  it("kichik xona: zona yo'q, «Xona hali kichik»", () => {
    const html = render(
      liga({ xona: { raqam: 1, hajmi: 6, qatorlar: [qator(1)], kotarilishZonasi: { soni: 5, faol: false } } }),
    );
    expect(html).toContain("Xona hali kichik");
    expect(html).not.toContain("bg-success/10");
  });

  it("xonada emas: «Liga: birinchi seansdan keyin», daraja baribir ko'rinadi", () => {
    const html = render(liga({ azo: false, xona: null, daraja: { tier: 0, nomi: "Bronza" } }));
    expect(html).toContain("Liga: birinchi seansdan keyin");
    expect(html).toContain("Bronza ligasi");
  });

  it("o'tgan hafta: ko'tarildi yoki o'rin", () => {
    expect(
      render(liga({ otganHafta: { daraja: { tier: 0, nomi: "Bronza" }, orin: 3, kotarildi: true, hajmi: 22 } })),
    ).toContain("Siz 3-o&#x27;rin · Kumush ligasiga ko&#x27;tarildingiz");
    expect(
      render(liga({ otganHafta: { daraja: { tier: 1, nomi: "Kumush" }, orin: 8, kotarildi: false, hajmi: 22 } })),
    ).toContain("Siz 8-o&#x27;rin · 22 kishi");
  });

  it("«Butun markaz» — ikkinchi darajali tugma, ro'yxat bosilgandagina", () => {
    const html = render(liga());
    expect(html).toContain("Butun markaz");
    expect(html).toContain('aria-expanded="false"');
  });

  it("«Butun markaz» liga yuklanayotganda ham, xatoda ham bor", async () => {
    const yuklanmoqda = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(LigaTab)),
    );
    expect(yuklanmoqda).toContain("Butun markaz");
    expect(yuklanmoqda).toContain("h-[88px]");

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
    });
    await client.prefetchQuery({
      queryKey: ["lernen", "liga"],
      queryFn: () => Promise.reject(new Error("Network Error")),
    });
    const xato = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(LigaTab)),
    );
    expect(xato).toContain("Ma&#x27;lumotni yuklab bo&#x27;lmadi");
    expect(xato).toContain("Butun markaz");
    expect(xato).toContain('aria-expanded="false"');
  });

  it("skelet yuklangan ekran o'lchamlarini egallaydi", () => {
    const html = renderToStaticMarkup(createElement(LigaSkelet));
    expect(html).toContain("h-[88px]");
    expect(html).toContain("space-y-4");
    expect(html.match(/h-\[54px\]/g)).toHaveLength(6);
  });

  it("o'z qatori «Siz» deb o'qiladi, jadval ro'yxat sifatida nomlangan", () => {
    const html = render(liga());
    expect(html.match(/Siz: /g)).toHaveLength(1);
    expect(html).toContain('aria-label="Liga xonasi jadvali"');
    expect(html).toContain("kamida 50 ball");
  });

  it("Olmos: zona yo'q, yuqori ligadan ko'tarilish yo'q", () => {
    const html = render(
      liga({ daraja: { tier: 4, nomi: "Olmos" }, xona: { raqam: 1, hajmi: 20, qatorlar: [qator(1)], kotarilishZonasi: { soni: 0, faol: false } } }),
    );
    expect(html).toContain("bu yerdan ko&#x27;tarilish yo&#x27;q");
    expect(html).not.toContain("bg-success/10");
  });

  it("ekranda inglizcha so'z yo'q", () => {
    expect(render(liga())).not.toMatch(/league|room|promot|\brank/i);
  });
});
