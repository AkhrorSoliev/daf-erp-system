import { describe, expect, it } from "vitest";
import { TUGUN_TONLARI } from "../tema-turlari";
import { DARAJA_TONI, belgiTuri, tugunRangi } from "./toza-tugun-model";

describe("toza tugun modeli", () => {
  it("shows a check for done, a star for the current one and a lock for the rest", () => {
    expect(belgiTuri("done")).toBe("tekshirildi");
    expect(belgiTuri("active")).toBe("yulduz");
    expect(belgiTuri("locked")).toBe("qulf");
  });

  it("a finished node is gold whatever its level colour is", () => {
    const ranglar = TUGUN_TONLARI.map((tone) => tugunRangi("done", tone).yuz);
    expect(new Set(ranglar).size).toBe(1);
  });

  it("the current node takes its level colour", () => {
    expect(tugunRangi("active", "coral").yuz).toBe("var(--coral-500)");
    expect(tugunRangi("active", "teal").yuz).toBe("var(--teal-500)");
    expect(tugunRangi("active", "grape").yuz).toBe("var(--grape-500)");
  });

  it("every state has a face and a darker lip", () => {
    for (const holat of ["done", "active", "locked"] as const) {
      for (const tone of TUGUN_TONLARI) {
        const r = tugunRangi(holat, tone);
        expect(r.yuz.length).toBeGreaterThan(0);
        expect(r.lab.length).toBeGreaterThan(0);
        expect(r.lab).not.toBe(r.yuz);
      }
    }
  });
});

describe("DARAJA_TONI", () => {
  it("is the path's CEO-approved level colours: A1 coral, A2 teal, B1 grape", () => {
    expect(DARAJA_TONI).toEqual({ A1: "coral", A2: "teal", B1: "grape" });
  });
});
