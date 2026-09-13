import { afterEach, describe, expect, it } from "vitest";
import { _reyestrniTozala, anyMediaPlaying, registerMedia } from "./media-registry";

const el = (paused: boolean, ended = false) => ({ paused, ended });

afterEach(() => _reyestrniTozala());

describe("media-registry", () => {
  it("bo'sh reyestr — ijro yo'q", () => {
    expect(anyMediaPlaying()).toBe(false);
  });

  it("pauzadagi element ijro emas, o'ynayotgani ijro", () => {
    registerMedia(el(true));
    expect(anyMediaPlaying()).toBe(false);
    registerMedia(el(false));
    expect(anyMediaPlaying()).toBe(true);
  });

  it("tugagan (ended) element ijro hisoblanmaydi", () => {
    registerMedia({ paused: false, ended: true });
    expect(anyMediaPlaying()).toBe(false);
  });

  it("ro'yxatdan chiqarilgan element hisobga kirmaydi", () => {
    const chiqar = registerMedia(el(false));
    chiqar();
    expect(anyMediaPlaying()).toBe(false);
  });
});
