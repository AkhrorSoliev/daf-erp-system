import { describe, expect, it, vi } from "vitest";
import { changeUiLocale, type ChangeUiLocaleDeps, type LocaleState } from "./change-ui-locale";

function setup(over: Partial<ChangeUiLocaleDeps> = {}) {
  let state: LocaleState = { locale: "uz", dictionary: {} };
  const deps: ChangeUiLocaleDeps = {
    current: () => state,
    load: vi.fn(async (locale) => ({ marker: locale })),
    apply: vi.fn((locale, dictionary) => {
      state = { locale, dictionary };
    }),
    persist: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn(),
    ...over,
  };
  return { deps, read: () => state };
}

describe("changeUiLocale", () => {
  it("loads the dictionary, applies it, then saves", async () => {
    const { deps, read } = setup();
    expect(await changeUiLocale("ru", deps)).toBe(true);
    expect(deps.apply).toHaveBeenCalledWith("ru", { marker: "ru" });
    expect(deps.persist).toHaveBeenCalledWith("ru");
    expect(read().locale).toBe("ru");
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("changes nothing and says so when the dictionary cannot be loaded", async () => {
    const boom = new Error("offline");
    const { deps, read } = setup({ load: vi.fn().mockRejectedValue(boom) });
    expect(await changeUiLocale("de", deps)).toBe(false);
    expect(deps.apply).not.toHaveBeenCalled();
    expect(read().locale).toBe("uz");
    expect(deps.fail).toHaveBeenCalledWith(boom, "load");
  });

  it("puts the previous language back when the save fails", async () => {
    const boom = new Error("500");
    const { deps, read } = setup({ persist: vi.fn().mockRejectedValue(boom) });
    expect(await changeUiLocale("ru", deps)).toBe(false);
    expect(read()).toEqual({ locale: "uz", dictionary: {} });
    expect(deps.fail).toHaveBeenCalledWith(boom, "save");
  });

  it("lets only the latest choice act when two overlap", async () => {
    let releaseFirst!: () => void;
    const slow = new Promise<void>((resolve) => (releaseFirst = resolve));
    const load = vi.fn(async (locale: string) => {
      if (locale === "ru") await slow;
      return { marker: locale };
    });
    const { deps, read } = setup({ load });
    const first = changeUiLocale("ru", deps);
    const second = await changeUiLocale("en", deps);
    releaseFirst();
    const firstResult = await first;
    expect(second).toBe(true);
    expect(firstResult).toBe(false);
    expect(read().locale).toBe("en");
  });
});
