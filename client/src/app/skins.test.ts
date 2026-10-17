import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, cssTokens } from "@/test-support/oklch-contrast";
import { DEFAULT_SKIN, UI_SKINS } from "@/lib/ui-skins";

const globals = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const skinsCss = readFileSync(path.join(__dirname, "skins.css"), "utf8");
const layout = readFileSync(path.join(__dirname, "layout.tsx"), "utf8");
const authProvider = readFileSync(path.join(__dirname, "../components/providers/auth-provider.tsx"), "utf8");

const SKINS = UI_SKINS.filter((s) => s.id !== DEFAULT_SKIN).map((s) => s.id);
const base = cssTokens(globals, ":root");
const baseDark = cssTokens(globals, ".dark");

/** What the cascade gives each mode: the base tokens, then the skin's blocks in specificity order. */
function themes(id: string) {
  const light = { ...base, ...cssTokens(skinsCss, `:root[data-skin="${id}"]`) };
  const dark = { ...base, ...baseDark, ...cssTokens(skinsCss, `:root[data-skin="${id}"]`), ...cssTokens(skinsCss, `.dark[data-skin="${id}"]`) };
  return { light, dark };
}

const FONT_OF: Record<string, string> = {
  ormon: "--font-rubik",
  gilos: "--font-montserrat",
  grafit: "--font-roboto-condensed",
  qum: "--font-ubuntu",
};

describe.each(SKINS)("skin %s", (id) => {
  it.each(["light", "dark"] as const)("keeps text readable in the %s theme", (mode) => {
    const t = themes(id)[mode];
    for (const surface of ["--background", "--card"]) {
      for (const text of ["--foreground", "--muted-foreground", "--destructive", "--success", "--info"]) {
        expect(contrast(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t["--primary-foreground"], t["--primary"]), "button label").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--sidebar-foreground"], t["--sidebar"]), "menu text").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--warning"], t["--card"]), "warning mark").toBeGreaterThanOrEqual(3);
  });

  it("writes the dark block after the light one (equal specificity, source order decides)", () => {
    const light = skinsCss.indexOf(`:root[data-skin="${id}"] {`);
    const dark = skinsCss.indexOf(`.dark[data-skin="${id}"] {`);
    expect(light).toBeGreaterThanOrEqual(0);
    expect(dark).toBeGreaterThan(light);
  });

  it("leaves the status colours and the other chart colours to the base theme", () => {
    for (const sel of [`:root[data-skin="${id}"]`, `.dark[data-skin="${id}"]`]) {
      const block = skinsCss.match(new RegExp(`^${sel.replace(/[.[\]"()]/g, "\\$&")} \\{([^}]*)\\}`, "m"))?.[1] ?? "";
      expect(block, `${sel} block exists`).not.toBe("");
      expect(block).not.toMatch(/--(destructive|success|warning|info|chart-[2-5]):/);
    }
  });

  it("points the font at a family layout.tsx really loads", () => {
    const fontVar = FONT_OF[id];
    expect(skinsCss).toContain(`html[data-skin="${id}"] { --font-plex: var(${fontVar}); }`);
    expect(layout).toContain(`variable: "${fontVar}"`);
  });
});

describe("skin wiring", () => {
  // `--font-plex` points at `var(--font-x)`; the variable exists only while the
  // font's `.variable` class is on <html>. Drop it and the skin falls back to
  // the browser font with every other test green.
  const htmlClasses = layout.match(/<html[^>]*className=\{cn\(([^)]*)\)/)?.[1] ?? "";

  it("puts every skin font's class on <html>", () => {
    expect(htmlClasses).not.toBe("");
    for (const font of ["rubik", "montserrat", "robotoCondensed", "ubuntu"]) {
      expect(layout, `const ${font}`).toMatch(new RegExp(`const ${font} = `));
      expect(htmlClasses, `${font}.variable on <html>`).toContain(`${font}.variable`);
    }
  });

  it("runs the boot script in <head> and mounts SkinSync", () => {
    expect(layout).toMatch(/<head>[^]*SKIN_BOOT_SCRIPT[^]*<\/head>/);
    expect(authProvider).toContain("<SkinSync />");
  });
});
