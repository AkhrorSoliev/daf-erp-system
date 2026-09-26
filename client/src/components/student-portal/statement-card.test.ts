import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatementCard } from "./statement-card";

describe("StatementCard", () => {
  it("offers the statement PDF under the balance", () => {
    const html = renderToStaticMarkup(createElement(StatementCard));
    expect(html).toContain("To&#x27;lovlar hisoboti");
    expect(html).toContain(
      "Har bir to&#x27;lovingiz qaysi darslarga ketgani, oyma-oy",
    );
    expect(html).toContain("PDF yuklab olish");
    expect(html).toContain("bg-coral-500");
  });
});
