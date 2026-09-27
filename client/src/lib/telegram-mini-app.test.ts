import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_BOUNCE_MS,
  bouncedAfterSignIn,
  clearMiniAppSignedIn,
  closeMiniApp,
  getTelegramWebApp,
  isMiniAppSession,
  markMiniAppSession,
  markMiniAppSignedIn,
  markMiniAppSignedOut,
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
