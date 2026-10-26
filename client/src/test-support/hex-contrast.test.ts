import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "./hex-contrast";

// Known answers, so a changed argument order or formula cannot quietly move
// every contrast result that is built on these helpers.
describe("hex-contrast", () => {
  it("hexContrast: white on black is 21:1 and #777 on white is the textbook 4.48:1, in either order", () => {
    expect(hexContrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(hexContrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(hexContrast("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
  });

  it("mixHex: the first colour lies over the second at its own opacity", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    // Not symmetric at 0.25: 25% black over white, never 25% white over black.
    expect(mixHex("#000000", "#ffffff", 0.25)).toBe("#bfbfbf");
  });

  it("cssHexToken: reads the block that the selector opens, and fails loudly on a missing token", () => {
    const css = ".lumio {\n  --ink: #111111;\n}\n.dark .lumio {\n  --ink: #EEEEEE;\n}\n";
    expect(cssHexToken(css, ".lumio", "ink")).toBe("#111111");
    expect(cssHexToken(css, ".dark .lumio", "ink")).toBe("#eeeeee");
    expect(() => cssHexToken(css, ".lumio", "paper")).toThrow("--paper not found in .lumio");
  });
});
