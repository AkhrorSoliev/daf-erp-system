import { describe, expect, it } from "vitest";
import { looksLikeGroupMove } from "./exit-reason-utils";

describe("looksLikeGroupMove", () => {
  it.each([
    "Boshqa guruhga ko'chdi",
    "Boshqa guruhga ko‘chdi",
    "KO'CHIB KETDI",
    "Guruh almashtirdi",
    "Boshqa guruhga o'tkazildi",
    "o‘tkazish",
    "o’tkaz",
  ])("true: %s", (label) => expect(looksLikeGroupMove(label)).toBe(true));

  it.each(["bog'lana olmadik", "O'qishni tashladi", "Boshqa sabab", ""])(
    "false: %s",
    (label) => expect(looksLikeGroupMove(label)).toBe(false),
  );
});
