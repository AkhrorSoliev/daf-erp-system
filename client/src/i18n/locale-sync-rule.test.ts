import { describe, expect, it } from "vitest";
import { localeSyncAction } from "./locale-sync-rule";

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
