import { describe, expect, it } from "vitest";
import { changeUiLocale } from "./change-ui-locale";
import { localeSyncStep } from "./locale-sync-rule";
import type { UiLocale } from "./locales";

/**
 * `setLocale` (the real `changeUiLocale`) and `LocaleSync` (the real
 * `localeSyncStep`) meet around an in-memory page and account. The sync step is
 * run after every state change, the way the effect runs after a commit, so a
 * step that fights the user's own change shows up here: the page switches
 * BEFORE the save is answered, while the account still holds the old language.
 */
function setup(input: { account: string | null | undefined; device: UiLocale; patchFails?: boolean }) {
  const page = { locale: input.device, dictionary: {} as Record<string, string> };
  const account = { uiLocale: input.account };
  const seen: UiLocale[] = [input.device];
  const failures: string[] = [];
  let patches = 0;
  let handledKey: string | null = null;
  const pending: Promise<boolean>[] = [];

  function setLocale(next: UiLocale, options?: { save?: boolean }): Promise<boolean> {
    return changeUiLocale(next, {
      current: () => ({ locale: page.locale, dictionary: page.dictionary }),
      load: async () => ({}),
      apply: (locale, dictionary) => {
        page.locale = locale;
        page.dictionary = dictionary;
        seen.push(locale);
        sync();
      },
      persist: async (locale) => {
        if (options?.save === false) return;
        patches += 1;
        await Promise.resolve();
        if (input.patchFails) throw new Error("PATCH failed");
        account.uiLocale = locale; // patchUser, after the PATCH
        sync();
      },
      fail: (_error, stage) => failures.push(stage),
    });
  }

  function sync() {
    const step = localeSyncStep({
      signedIn: true,
      accountLocale: account.uiLocale,
      deviceLocale: page.locale,
      handledKey,
    });
    handledKey = step.handledKey;
    if (step.action.kind === "adopt-account") pending.push(setLocale(step.action.locale, { save: false }));
    else if (step.action.kind === "save-device") pending.push(setLocale(step.action.locale));
  }

  async function settle() {
    while (pending.length) await pending.shift();
  }

  return {
    page,
    account,
    seen,
    failures,
    patches: () => patches,
    sync,
    settle,
    setLocale,
  };
}

describe("setLocale and LocaleSync together", () => {
  it("(a) saves a pick once for an account that never chose, and never flips back", async () => {
    const s = setup({ account: undefined, device: "uz" });
    s.sync();
    expect(await s.setLocale("ru")).toBe(true);
    await s.settle();
    expect(s.patches()).toBe(1);
    expect(s.page.locale).toBe("ru");
    expect(s.account.uiLocale).toBe("ru");
    expect(s.seen).toEqual(["uz", "ru"]);
    expect(s.failures).toEqual([]);
  });

  it("(b) a failed save for an account that never chose restores the language once, with one notice", async () => {
    const s = setup({ account: undefined, device: "uz", patchFails: true });
    s.sync();
    expect(await s.setLocale("ru")).toBe(false);
    await s.settle();
    expect(s.patches()).toBe(1);
    expect(s.failures).toEqual(["save"]);
    expect(s.page.locale).toBe("uz");
    expect(s.account.uiLocale).toBeUndefined();
    expect(s.seen).toEqual(["uz", "ru", "uz"]);
  });

  it("(c) saves a pick once for an account on Uzbek, and does not drop back to Uzbek meanwhile", async () => {
    const s = setup({ account: "uz", device: "uz" });
    s.sync();
    expect(await s.setLocale("ru")).toBe(true);
    await s.settle();
    expect(s.patches()).toBe(1);
    expect(s.page.locale).toBe("ru");
    expect(s.account.uiLocale).toBe("ru");
    expect(s.seen).toEqual(["uz", "ru"]);
    expect(s.failures).toEqual([]);
  });

  it("(d) a failed save for an account on Uzbek ends on Uzbek with one notice", async () => {
    const s = setup({ account: "uz", device: "uz", patchFails: true });
    s.sync();
    expect(await s.setLocale("ru")).toBe(false);
    await s.settle();
    expect(s.patches()).toBe(1);
    expect(s.failures).toEqual(["save"]);
    expect(s.page.locale).toBe("uz");
    expect(s.account.uiLocale).toBe("uz");
  });

  it("(e) adopts the account's language on the first sync, without writing it back", async () => {
    const s = setup({ account: "ru", device: "uz" });
    s.sync();
    await s.settle();
    expect(s.patches()).toBe(0);
    expect(s.page.locale).toBe("ru");
    expect(s.account.uiLocale).toBe("ru");
    expect(s.seen).toEqual(["uz", "ru"]);
    expect(s.failures).toEqual([]);
  });

  it("(f) does nothing for an account that never chose while the device is on Uzbek", async () => {
    const s = setup({ account: null, device: "uz" });
    s.sync();
    await s.settle();
    expect(s.patches()).toBe(0);
    expect(s.seen).toEqual(["uz"]);
    expect(s.failures).toEqual([]);
  });

  it("(g) saves the device's language once on an account that never chose one", async () => {
    const s = setup({ account: null, device: "ru" });
    s.sync();
    await s.settle();
    expect(s.patches()).toBe(1);
    expect(s.account.uiLocale).toBe("ru");
    expect(s.page.locale).toBe("ru");
    expect(s.failures).toEqual([]);
  });
});
