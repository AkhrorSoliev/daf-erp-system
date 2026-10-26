import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { LernenKorinishTanlash } from "./lernen-korinish-tanlash";

/** The first paint: no profile answer yet, no effects run, so the defaults show. */
function render(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LernenKorinishTanlash)));
}

describe("LernenKorinishTanlash (server markup)", () => {
  it("has a row for the look, one for sound and one for less motion", () => {
    const html = render();
    expect(html).toContain("Ta&#x27;lim ko&#x27;rinishi");
    expect(html).toContain("Ovozlar");
    expect(html).toContain("Kam harakat");
    // The look row names the chosen look; the dialogs stay closed until a row is pressed.
    expect(html).toContain("Toza");
    expect(html).not.toContain('role="radiogroup"');
  });

  it("has the sound switch and nothing to play next to it", () => {
    const html = render();
    expect(html).toContain('role="switch"');
    expect(html).not.toContain("Tinglab");
    expect(html).not.toContain("quvnoq");
  });

  it("says whether sound and less motion are on", () => {
    const html = render();
    // Sound is on until switched off, reduced motion is off until switched on.
    expect(html).toContain("Yoqilgan");
    expect(html).toContain("O&#x27;chiq");
  });
});
