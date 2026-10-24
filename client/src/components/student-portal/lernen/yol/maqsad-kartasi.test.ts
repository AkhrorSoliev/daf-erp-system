import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { MaqsadKartasi } from "./maqsad-kartasi";
import type { Maqsad } from "../types";

function render(maqsad: Maqsad): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MaqsadKartasi, { maqsad }),
    ),
  );
}

const asos: Maqsad = { daraja: "ORTA", ball: 80, hozir: 40, bajarildi: false, bosh: false };

describe("MaqsadKartasi", () => {
  it("jarayon: «Bugungi maqsad», «40 / 80 ball», daraja va o'zgartirish", () => {
    const html = render(asos);
    expect(html).toContain("Bugungi maqsad");
    expect(html).toContain("40 / 80 ball");
    expect(html).toContain("O&#x27;rta · o&#x27;zgartirish");
    expect(html).not.toContain("text-success");
  });

  it("bajarildi: muvaffaqiyat rangi va «Maqsad bajarildi»", () => {
    const html = render({ ...asos, hozir: 90, bajarildi: true });
    expect(html).toContain("Maqsad bajarildi");
    expect(html).toContain("text-success");
  });

  it("bosh: «Bugun mashq qolmadi»", () => {
    const html = render({ ...asos, hozir: 0, bajarildi: true, bosh: true });
    expect(html).toContain("Bugun mashq qolmadi");
  });

  it("karta — bitta tugma, oynacha yopiq", () => {
    const html = render(asos);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("≈ ikki seans");
  });
});
