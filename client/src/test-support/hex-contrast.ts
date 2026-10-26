/** sRGB relative luminance of a `#rrggbb` colour (WCAG 2). */
export function hexLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function hexContrast(a: string, b: string): number {
  const [hi, lo] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` laid over `bottom` at `top`'s opacity `alpha`, as `#rrggbb`. */
export function mixHex(top: string, bottom: string, alpha: number): string {
  const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [t, b] = [ch(top), ch(bottom)];
  return `#${t
    .map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A `--token: #rrggbb;` value from the first block of a stylesheet opened by
 * `selector` at the start of a line (".lumio", ".dark .lumio").
 */
export function cssHexToken(css: string, selector: string, token: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
  const m = block.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${token} not found in ${selector}`);
  return m[1].toLowerCase();
}
