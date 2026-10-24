import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { markedText, unmarked } from "./marked-text";

const bold = (nodes: ReturnType<typeof markedText>) => nodes.filter(isValidElement).length;

describe("unmarked", () => {
  it("keeps a title's «**» from toggling bold in the sentence around it", () => {
    const title = unmarked("a **b** c");
    expect(bold(markedText(`«${title}» **Jarayonda** dan **Bajarildi** ga`))).toBe(2);
    expect(title.replace(/​/g, "")).toBe("a **b** c");
  });
});
