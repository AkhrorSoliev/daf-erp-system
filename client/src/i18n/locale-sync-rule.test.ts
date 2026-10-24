import { describe, expect, it } from "vitest";
import { localeSyncAction, localeSyncStep } from "./locale-sync-rule";

describe("localeSyncAction", () => {
  it("adopts the account's language when it differs from the device's", () => {
    expect(localeSyncAction({ accountLocale: "ru", deviceLocale: "uz" })).toEqual({ kind: "adopt-account", locale: "ru" });
    expect(localeSyncAction({ accountLocale: "uz", deviceLocale: "de" })).toEqual({ kind: "adopt-account", locale: "uz" });
  });

  it("does nothing when the account and the device agree", () => {
    expect(localeSyncAction({ accountLocale: "ru", deviceLocale: "ru" })).toEqual({ kind: "none" });
  });

  it("saves the device's language on an account that never chose one", () => {
    expect(localeSyncAction({ accountLocale: null, deviceLocale: "ru" })).toEqual({ kind: "save-device", locale: "ru" });
    expect(localeSyncAction({ accountLocale: undefined, deviceLocale: "uz-Cyrl" })).toEqual({ kind: "save-device", locale: "uz-Cyrl" });
  });

  it("leaves an account with no language alone while the device is on Uzbek", () => {
    expect(localeSyncAction({ accountLocale: null, deviceLocale: "uz" })).toEqual({ kind: "none" });
  });

  it("ignores an account value it does not know", () => {
    expect(localeSyncAction({ accountLocale: "fr", deviceLocale: "ru" })).toEqual({ kind: "save-device", locale: "ru" });
  });
});

describe("localeSyncStep", () => {
  const none = { kind: "none" } as const;

  it("does nothing, and forgets what it handled, while nobody is signed in", () => {
    expect(localeSyncStep({ signedIn: false, accountLocale: "ru", deviceLocale: "uz", handledKey: "ru" })).toEqual({
      action: none,
      handledKey: null,
    });
  });

  it("decides once for a new account value and remembers it", () => {
    expect(localeSyncStep({ signedIn: true, accountLocale: "ru", deviceLocale: "uz", handledKey: null })).toEqual({
      action: { kind: "adopt-account", locale: "ru" },
      handledKey: "ru",
    });
    expect(localeSyncStep({ signedIn: true, accountLocale: undefined, deviceLocale: "de", handledKey: null })).toEqual({
      action: { kind: "save-device", locale: "de" },
      handledKey: "none",
    });
  });

  it("does not decide again for the same account value, whatever the device shows by then", () => {
    // the page switches before the save is answered: the account still holds the old value
    expect(localeSyncStep({ signedIn: true, accountLocale: undefined, deviceLocale: "ru", handledKey: "none" })).toEqual({
      action: none,
      handledKey: "none",
    });
    expect(localeSyncStep({ signedIn: true, accountLocale: "uz", deviceLocale: "ru", handledKey: "uz" })).toEqual({
      action: none,
      handledKey: "uz",
    });
  });

  it("decides again when the account value changes", () => {
    expect(localeSyncStep({ signedIn: true, accountLocale: "ru", deviceLocale: "ru", handledKey: "none" })).toEqual({
      action: none,
      handledKey: "ru",
    });
    expect(localeSyncStep({ signedIn: true, accountLocale: "de", deviceLocale: "ru", handledKey: "ru" })).toEqual({
      action: { kind: "adopt-account", locale: "de" },
      handledKey: "de",
    });
  });

  it("treats a missing and a null account language alike", () => {
    expect(localeSyncStep({ signedIn: true, accountLocale: null, deviceLocale: "uz", handledKey: null }).handledKey).toBe("none");
    expect(localeSyncStep({ signedIn: true, accountLocale: undefined, deviceLocale: "uz", handledKey: null }).handledKey).toBe("none");
  });
});
