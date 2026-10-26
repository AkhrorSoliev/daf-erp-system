import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LERNEN_TEMA,
  LERNEN_TEMALAR,
  LERNEN_TEMA_IDLARI,
  TAYYOR_TEMALAR,
  isLernenTema,
  lernenTemaOrDefault,
} from "./lernen-temalar";

describe("lernen temalar", () => {
  it("lists the four looks, the default first, each with a label, hint and swatch", () => {
    expect([...LERNEN_TEMA_IDLARI]).toEqual(["toza", "ormon", "dengiz", "alp"]);
    expect(DEFAULT_LERNEN_TEMA).toBe("toza");
    for (const t of LERNEN_TEMALAR) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(0);
      expect(t.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("offers only the finished looks to pick from", () => {
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza", "ormon", "dengiz"]);
  });

  it("knows an id and falls back to the default for anything else", () => {
    expect(isLernenTema("alp")).toBe(true);
    expect(isLernenTema("neon")).toBe(false);
    expect(isLernenTema(null)).toBe(false);
    expect(lernenTemaOrDefault("dengiz")).toBe("dengiz");
    expect(lernenTemaOrDefault(undefined)).toBe("toza");
    expect(lernenTemaOrDefault("neon")).toBe("toza");
  });

  const server = () =>
    readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "common", "lernen-temalar.ts"),
      "utf8",
    );

  it("lists exactly the ids the server accepts", () => {
    const body = server().split("LERNEN_TEMA_IDLARI = [")[1].split("] as const")[0];
    const serverIds = [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(serverIds).toEqual([...LERNEN_TEMA_IDLARI]);
  });

  it("has the same default look as the server", () => {
    const m = server().match(/DEFAULT_LERNEN_TEMA\s*:[^=]*=\s*'([a-z]+)'/);
    expect(m?.[1]).toBe(DEFAULT_LERNEN_TEMA);
  });
});
