import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TONE_BAR } from "./attendance-format";

// `--danger` exists only inside `.lumio` (the student portal), so `bg-danger` drew nothing on this
// staff page: bars below 75% were empty and the «Kelmadi» dot was missing. Staff pages use `--destructive`.
const css = readFileSync(join(__dirname, "..", "..", "..", "app", "globals.css"), "utf-8");

/** The body of the first top-level `selector { … }` block (brace-matched, so nested rules do not cut it short). */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in globals.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error(`${selector} block is not closed`);
}

describe("«Davomat» colours exist on staff pages", () => {
  const files = readdirSync(__dirname).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));

  it("scans the page's sources", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)("%s uses no «-danger» class (use --destructive: bg-destructive, text-destructive)", (file) => {
    const found = readFileSync(join(__dirname, file), "utf-8").match(/\b(bg|text|border|ring|fill|stroke)-danger\b/g);
    expect(found, `${file}: --danger is defined only under .lumio; use the staff token --destructive`).toBeNull();
  });

  it("every TONE_BAR class is a utility whose variable the light and dark staff theme define", () => {
    for (const [tone, cls] of Object.entries(TONE_BAR)) {
      if (tone === "none") continue; // bg-muted is the shadcn base token
      const token = cls.replace(/^bg-/, "");
      expect(css, `${cls}: no --color-${token} in the theme`).toContain(`--color-${token}: var(--${token})`);
      expect(block(":root"), `${cls}: --${token} missing in :root`).toContain(`--${token}:`);
      expect(block(".dark"), `${cls}: --${token} missing in .dark`).toContain(`--${token}:`);
    }
  });
});
