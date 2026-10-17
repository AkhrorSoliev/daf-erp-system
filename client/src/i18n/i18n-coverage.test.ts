import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import de from "./dictionaries/de";
import en from "./dictionaries/en";
import ru from "./dictionaries/ru";
import uzCyrl from "./dictionaries/uz-cyrl";
import { scanI18nCalls } from "./scan-literals";

const SRC = path.join(__dirname, "..");

/**
 * Files whose every `t("…")` / `msg("…")` text must exist in the ru, de and en
 * dictionaries. A task that translates a file adds it here; the pages are added
 * as they are translated (spec 2026-10-17-tillar §9).
 */
export const STRICT_FILES: string[] = [
  "lib/nav-items.ts",
  "lib/payments-nav.ts",
  "lib/reports-nav.ts",
  "lib/daf-nav.ts",
  "components/app-sidebar.tsx",
  "components/sidebar-footer-info.tsx",
  "components/qollanma/qollanma-yangilik-belgisi.tsx",
  "lib/breadcrumb-routes.ts",
  "components/app-breadcrumb.tsx",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "dictionaries" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const scanFile = (file: string) => scanI18nCalls(readFileSync(file, "utf8"));

const files = walk(SRC);
const scans = files.map((file) => ({ file, ...scanFile(file) }));
const used = new Set(scans.flatMap((s) => s.literals));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const DICTIONARIES = { ru, de, en } as const;

describe("i18n coverage", () => {
  it("really walks the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("lists only files that exist", () => {
    for (const f of STRICT_FILES) expect(existsSync(path.join(SRC, f)), f).toBe(true);
  });

  it("reads every t(…) and msg(…) call of the source: a first argument it cannot check is an error", () => {
    const offenders = scans.flatMap((s) => s.unsupported.map((call) => `${path.relative(SRC, s.file)}: ${call}`));
    expect(offenders, `write a string literal in each call, ok ? t("Ha") : t("Yo'q"):\n${offenders.join("\n")}`).toEqual([]);
  });

  it.each(Object.entries(DICTIONARIES))("%s translates every text of the strict files", (name, dictionary) => {
    const missing: string[] = [];
    for (const f of STRICT_FILES) {
      for (const literal of scanFile(path.join(SRC, f)).literals) {
        if (!(literal in dictionary)) missing.push(`${f}: ${literal}`);
      }
    }
    expect(missing, `${name} is missing:\n${missing.join("\n")}`).toEqual([]);
  });

  it("gives ru, de and en the same keys", () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(de)).toEqual(keys(ru));
    expect(keys(en)).toEqual(keys(ru));
  });

  it.each(Object.entries({ ...DICTIONARIES, "uz-cyrl": uzCyrl }))("%s has no stale key, no empty text and matching placeholders", (name, dictionary) => {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(used.has(key), `${name}: unused key «${key}»`).toBe(true);
      expect(value.trim(), `${name}: empty text for «${key}»`).not.toBe("");
      expect(placeholders(value), `${name}: placeholders of «${key}»`).toEqual(placeholders(key));
    }
  });
});
