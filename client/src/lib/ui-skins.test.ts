import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKIN,
  UI_SKINS,
  UI_SKIN_IDS,
  isUiSkin,
  skinAttribute,
  skinOrDefault,
} from "./ui-skins";

describe("ui skins", () => {
  it("lists the five skins, the default first, each with a swatch and a hint", () => {
    expect([...UI_SKIN_IDS]).toEqual(["daftar", "ormon", "gilos", "grafit", "qum"]);
    expect(DEFAULT_SKIN).toBe("daftar");
    for (const s of UI_SKINS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
      expect(s.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("knows a skin id and falls back to the default for anything else", () => {
    expect(isUiSkin("ormon")).toBe(true);
    expect(isUiSkin("neon")).toBe(false);
    expect(isUiSkin(null)).toBe(false);
    expect(skinOrDefault("gilos")).toBe("gilos");
    expect(skinOrDefault(undefined)).toBe("daftar");
    expect(skinOrDefault("neon")).toBe("daftar");
  });

  it("puts no attribute on the page for the default skin", () => {
    expect(skinAttribute("daftar")).toBeNull();
    expect(skinAttribute(null)).toBeNull();
    expect(skinAttribute("qum")).toBe("qum");
  });

  it("lists exactly the ids the server accepts", () => {
    const server = readFileSync(
      path.join(__dirname, "../../../server/src/common/ui-skins.ts"),
      "utf8",
    );
    const list = server.match(/UI_SKIN_IDS = \[([^\]]*)\]/)?.[1] ?? "";
    const ids = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...UI_SKIN_IDS]);
  });
});
