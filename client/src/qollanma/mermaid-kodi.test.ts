import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { mermaidKodi } from "./mermaid-kodi";

describe("mermaid kodi", () => {
  it("```mermaid blokini taniydi", () => {
    const kod = createElement("code", { className: "language-mermaid" }, "graph TD\n  A-->B\n");
    expect(mermaidKodi(kod)).toBe("graph TD\n  A-->B");
  });
  it("boshqa kod bloki — null", () => {
    expect(mermaidKodi(createElement("code", { className: "language-ts" }, "x"))).toBeNull();
    expect(mermaidKodi("oddiy matn")).toBeNull();
  });
});
