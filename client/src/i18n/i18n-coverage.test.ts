import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import de from "./dictionaries/de";
import en from "./dictionaries/en";
import ru from "./dictionaries/ru";
import uzCyrl from "./dictionaries/uz-cyrl";

const SRC = path.join(__dirname, "..");

/**
 * Files whose every `t("…")` / `msg("…")` text must exist in the ru, de and en
 * dictionaries. A task that translates a file adds it here; the pages are added
 * as they are translated (spec 2026-10-17-tillar §9).
 */
export const STRICT_FILES: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "dictionaries" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const CALL = /\b(?:t|msg)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
const unescape = (s: string) => s.replace(/\\(.)/g, "$1");

function literalsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(CALL)].map((m) => unescape(m[1] ?? m[2] ?? ""));
}

const files = walk(SRC);
const used = new Set(files.flatMap(literalsOf));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const DICTIONARIES = { ru, de, en } as const;

describe("i18n coverage", () => {
  it("lists only files that exist", () => {
    for (const f of STRICT_FILES) expect(existsSync(path.join(SRC, f)), f).toBe(true);
  });

  it.each(Object.entries(DICTIONARIES))("%s translates every text of the strict files", (name, dictionary) => {
    const missing: string[] = [];
    for (const f of STRICT_FILES) {
      for (const literal of literalsOf(path.join(SRC, f))) {
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
