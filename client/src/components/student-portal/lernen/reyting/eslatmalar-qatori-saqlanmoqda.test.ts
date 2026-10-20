import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
// Saqlanayotgan holat: `isPending` true.
vi.mock("../queries", async (asl) => ({
  ...(await asl<typeof import("../queries")>()),
  useEslatmalarOzgartir: () => ({ isPending: true, mutate: vi.fn() }),
}));

import { EslatmalarQatori } from "./eslatmalar-qatori";
import type { Fortschritt } from "../types";

function render(f: Partial<Fortschritt>): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "fortschritt"], f as Fortschritt);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(EslatmalarQatori)),
  );
}

describe("EslatmalarQatori — saqlanayotganda", () => {
  // `disabled` tugmani fokusdan chiqaradi (Space dan keyin klaviatura yo'qoladi)
  // va har bosishda xira miltillaydi; ikki marta bosish `onClick` da to'xtatiladi.
  it("tugma `disabled` bo'lmaydi va xiralashmaydi, holati o'zgarmaydi", () => {
    const html = render({ eslatmalar: true, telegramUlangan: true });
    expect(html).not.toContain('disabled=""');
    expect(html).not.toMatch(/[\s"]disabled:opacity/);
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).toContain('aria-checked="true"');
  });
});
