import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_BOUNCE_MS,
  STAFF_CABINET_HOME,
  bouncedAfterSignIn,
  clearMiniAppSignedIn,
  closeMiniApp,
  getTelegramWebApp,
  isMiniAppSession,
  markMiniAppSession,
  markMiniAppSignedIn,
  markMiniAppSignedOut,
  miniAppAudienceForHost,
  onMiniAppActivated,
  openOutsideMiniApp,
  staffCabinetPath,
  wasSignedOutInMiniApp,
} from "./telegram-mini-app";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mini App flags", () => {
  it("are off on the server, where there is no window", () => {
    expect(isMiniAppSession()).toBe(false);
    expect(wasSignedOutInMiniApp()).toBe(false);
    expect(() => markMiniAppSession()).not.toThrow();
  });

  it("marks this tab as the Mini App", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });

    expect(isMiniAppSession()).toBe(false);
    markMiniAppSession();
    expect(isMiniAppSession()).toBe(true);
  });

  it("records and clears an explicit sign-out", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });

    markMiniAppSignedOut(true);
    expect(wasSignedOutInMiniApp()).toBe(true);
    markMiniAppSignedOut(false);
    expect(wasSignedOutInMiniApp()).toBe(false);
  });

  it("treats blocked storage as no flag instead of throwing", () => {
    const blocked = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: blocked,
        setItem: blocked,
        removeItem: blocked,
      },
    });

    expect(() => markMiniAppSession()).not.toThrow();
    expect(isMiniAppSession()).toBe(false);
  });
});

describe("bouncedAfterSignIn — a sign-in the portal did not keep", () => {
  const T = 1_780_000_000_000;

  it("is false before any sign-in", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });
    expect(bouncedAfterSignIn(T)).toBe(false);
  });

  it("is true when /tg is reached again right after signing in", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });
    markMiniAppSignedIn(T);
    expect(bouncedAfterSignIn(T + 2_000)).toBe(true);
    expect(bouncedAfterSignIn(T + SIGN_IN_BOUNCE_MS - 1)).toBe(true);
  });

  it("is false once the window has passed — a later reopening signs in normally", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });
    markMiniAppSignedIn(T);
    expect(bouncedAfterSignIn(T + SIGN_IN_BOUNCE_MS)).toBe(false);
  });

  it("is false after the marker is cleared, so «Qayta urinish» can sign in", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });
    markMiniAppSignedIn(T);
    clearMiniAppSignedIn();
    expect(bouncedAfterSignIn(T + 1_000)).toBe(false);
  });

  it("ignores a marker from the future (a clock set back)", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage() });
    markMiniAppSignedIn(T);
    expect(bouncedAfterSignIn(T - 5_000)).toBe(false);
  });

  it("is false on the server", () => {
    expect(bouncedAfterSignIn(T)).toBe(false);
    expect(() => markMiniAppSignedIn(T)).not.toThrow();
  });
});

describe("getTelegramWebApp", () => {
  it("is null outside a browser and outside Telegram", () => {
    expect(getTelegramWebApp()).toBeNull();
    vi.stubGlobal("window", {});
    expect(getTelegramWebApp()).toBeNull();
  });

  it("returns Telegram's WebApp object once the script has loaded", () => {
    const webApp = { initData: "auth_date=1&hash=x" };
    vi.stubGlobal("window", { Telegram: { WebApp: webApp } });
    expect(getTelegramWebApp()).toBe(webApp);
  });
});

describe("closeMiniApp", () => {
  it("closes the Mini App inside Telegram", () => {
    const close = vi.fn();
    vi.stubGlobal("window", { Telegram: { WebApp: { close } } });
    closeMiniApp();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does nothing outside Telegram", () => {
    vi.stubGlobal("window", {});
    expect(() => closeMiniApp()).not.toThrow();
  });
});

// The Mini App used to send its own page to the gateway, where it stayed
// inside Telegram's WebView and could not hand over to the Payme or Click app.
describe("openOutsideMiniApp — a payment link from the Mini App", () => {
  const CHECKOUT = "https://checkout.paycom.uz/bT0xMjM7YT0xMDAwMDA=";

  it("hands the link to Telegram, which opens it outside the Mini App", () => {
    const openLink = vi.fn();
    vi.stubGlobal("window", {
      Telegram: { WebApp: { initData: "auth_date=1&hash=x", openLink } },
    });

    expect(openOutsideMiniApp(CHECKOUT)).toBe(true);
    expect(openLink).toHaveBeenCalledExactlyOnceWith(CHECKOUT);
  });

  it("leaves the link to the caller outside a browser and outside Telegram", () => {
    expect(openOutsideMiniApp(CHECKOUT)).toBe(false);
    vi.stubGlobal("window", {});
    expect(openOutsideMiniApp(CHECKOUT)).toBe(false);
  });

  it("leaves the link to the caller when the script runs outside Telegram", () => {
    // `/tg` opened in an ordinary browser loads the script too, with no
    // `initData`; its `openLink` would try a popup there.
    const openLink = vi.fn();
    vi.stubGlobal("window", { Telegram: { WebApp: { initData: "", openLink } } });

    expect(openOutsideMiniApp(CHECKOUT)).toBe(false);
    expect(openLink).not.toHaveBeenCalled();
  });

  it("leaves the link to the caller when Telegram rejects it", () => {
    const openLink = vi.fn(() => {
      throw new Error("WebAppTgUrlInvalid");
    });
    vi.stubGlobal("window", {
      Telegram: { WebApp: { initData: "auth_date=1&hash=x", openLink } },
    });

    expect(openOutsideMiniApp("tel:+998901234567")).toBe(false);
  });
});

describe("onMiniAppActivated", () => {
  it("follows Telegram's `activated` until the returned function stops it", () => {
    const onEvent = vi.fn();
    const offEvent = vi.fn();
    vi.stubGlobal("window", {
      Telegram: {
        WebApp: { initData: "auth_date=1&hash=x", onEvent, offEvent },
      },
    });
    const callback = () => {};

    const stop = onMiniAppActivated(callback);
    expect(onEvent).toHaveBeenCalledExactlyOnceWith("activated", callback);
    expect(offEvent).not.toHaveBeenCalled();

    stop();
    expect(offEvent).toHaveBeenCalledExactlyOnceWith("activated", callback);
  });

  it("does nothing outside Telegram", () => {
    expect(() => onMiniAppActivated(() => {})()).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => onMiniAppActivated(() => {})()).not.toThrow();
  });
});

describe("miniAppAudienceForHost (ADR-0045)", () => {
  it.each([
    ["lehrer.dafzentrum.uz", "staff"],
    ["admin.dafzentrum.uz", "staff"],
    ["student.dafzentrum.uz", "student"],
    // Lokal va tunnel — o'quvchi kabineti, avvalgidek.
    ["localhost:3000", "student"],
    ["abc.ngrok.app", "student"],
  ] as const)("%s → %s", (host, audience) => {
    expect(miniAppAudienceForHost(host)).toBe(audience);
  });
});

describe("staffCabinetPath", () => {
  it("opens the profile when the bot names no page", () => {
    expect(staffCabinetPath(null)).toBe(STAFF_CABINET_HOME);
    expect(staffCabinetPath(undefined)).toBe("/profile");
    expect(staffCabinetPath("")).toBe("/profile");
  });

  it.each(["/", "/profile", "/profile/salary", "/schedule", "/groups"])(
    "opens %s, a page the bot's menu names",
    (page) => {
      expect(staffCabinetPath(page)).toBe(page);
    },
  );

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/tg",
    "/login",
    "/payments",
    "/profile/../payments",
  ])("never follows %s — the profile instead", (next) => {
    expect(staffCabinetPath(next)).toBe("/profile");
  });
});
