import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HARAKAT_KALITI,
  HARAKAT_OZGARDI,
  harakatniSaqla,
  kamHarakatHozir,
  kamHarakatQarori,
  yengilRejimmi,
} from "./kam-harakat";

describe("kamHarakatQarori", () => {
  it("follows the system setting when the student made no choice", () => {
    expect(kamHarakatQarori(null, true)).toBe(true);
    expect(kamHarakatQarori(null, false)).toBe(false);
  });
  it("a device choice to reduce always wins", () => {
    expect(kamHarakatQarori(true, false)).toBe(true);
  });
  it("never turns motion back on against the system setting", () => {
    expect(kamHarakatQarori(false, true)).toBe(true);
  });
});

describe("kamHarakatHozir", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const brauzer = (tizim: boolean, qurilma: string | null) => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: tizim }) });
    vi.stubGlobal("localStorage", { getItem: () => qurilma });
  };

  it("counts the system setting even when the device switch was never touched", () => {
    brauzer(true, null);
    expect(kamHarakatHozir()).toBe(true);
  });
  it("counts the device switch without the system setting", () => {
    brauzer(false, "1");
    expect(kamHarakatHozir()).toBe(true);
  });
  it("is off when neither asks for less motion", () => {
    brauzer(false, "0");
    expect(kamHarakatHozir()).toBe(false);
  });
  it("is off on the server (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(kamHarakatHozir()).toBe(false);
  });
});

describe("yengilRejimmi", () => {
  it("is light on a weak device", () => {
    expect(yengilRejimmi({ yadro: 4 })).toBe(true);
    expect(yengilRejimmi({ xotira: 2 })).toBe(true);
  });
  it("is full on a normal device or when the browser says nothing", () => {
    expect(yengilRejimmi({ yadro: 8, xotira: 8 })).toBe(false);
    expect(yengilRejimmi({})).toBe(false);
  });
});

describe("harakatniSaqla", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      data,
      setItem: (k: string, v: string) => void data.set(k, v),
      getItem: (k: string) => data.get(k) ?? null,
    };
  }

  it("saves the choice and tells mounted consumers in the same tab", () => {
    const storage = fakeStorage();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent });

    harakatniSaqla(true);

    expect(storage.data.get(HARAKAT_KALITI)).toBe("1");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(HARAKAT_OZGARDI);
  });

  it("does not throw when there is no window (server)", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", undefined);

    expect(() => harakatniSaqla(false)).not.toThrow();
    expect(storage.data.get(HARAKAT_KALITI)).toBe("0");
  });
});
