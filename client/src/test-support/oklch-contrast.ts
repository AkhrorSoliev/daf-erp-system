export type Oklch = [number, number, number];

/** `oklch(L C H)` custom properties of the rule whose selector is exactly `selector`. */
export function cssTokens(css: string, selector: string): Record<string, Oklch> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`css has no "${selector}" rule`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[a-z-0-9]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);/g)].map((m) => [
      m[1],
      [Number(m[2]), Number(m[3]), Number(m[4])] as Oklch,
    ]),
  );
}

/** Relative luminance (WCAG) of an OKLCH colour, through linear sRGB. */
export function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

export function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
