import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OVOZ_KALITI, ovozYoqilganmi, ovozniSaqla } from "./ovoz-sozlama";

// Vitest runs in node: give the module a tiny localStorage.
function qalbakiOmbor(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  };
}

describe("ovoz sozlamasi", () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = qalbakiOmbor(); });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it("is on by default", () => {
    expect(ovozYoqilganmi()).toBe(true);
  });
  it("remembers a choice", () => {
    ovozniSaqla(false);
    expect(localStorage.getItem(OVOZ_KALITI)).toBe("0");
    expect(ovozYoqilganmi()).toBe(false);
    ovozniSaqla(true);
    expect(ovozYoqilganmi()).toBe(true);
  });
  it("falls back to on when storage is unavailable", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(ovozYoqilganmi()).toBe(true);
    expect(() => ovozniSaqla(false)).not.toThrow();
  });
});
