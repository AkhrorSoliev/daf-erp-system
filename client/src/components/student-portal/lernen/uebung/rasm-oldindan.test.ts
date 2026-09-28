import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicFrage } from "../types";

const preload = vi.fn();
vi.mock("react-dom", () => ({ preload: (...a: unknown[]) => preload(...a) }));

const { rasmlarniOldindanYukla, savolRasmlari } = await import("./rasm-oldindan");

function savol(format: PublicFrage["format"], extra: Partial<PublicFrage> = {}): PublicFrage {
  return {
    index: 0,
    format,
    itemType: "WORT",
    itemId: 1,
    prompt: "",
    hilfe: null,
    options: [],
    audioUrl: null,
    ...extra,
  };
}

describe("savolRasmlari", () => {
  it("a picture choice shows its four options", () => {
    const urls = ["https://m/1.jpg", "https://m/2.jpg", "https://m/3.jpg", "https://m/4.jpg"];
    expect(savolRasmlari(savol("BILD_WORT", { options: urls }))).toEqual(urls);
    expect(savolRasmlari(savol("AUDIO_BILD", { options: urls }))).toEqual(urls);
  });

  it("typing from a picture shows the one picture", () => {
    expect(savolRasmlari(savol("BILD_TIPPEN", { bildUrl: "https://m/1.jpg" }))).toEqual([
      "https://m/1.jpg",
    ]);
  });

  it("other questions, and no question, have no pictures", () => {
    expect(savolRasmlari(savol("WORT_UZ", { options: ["a", "b", "c", "d"] }))).toEqual([]);
    expect(savolRasmlari(undefined)).toEqual([]);
  });
});

describe("rasmlarniOldindanYukla", () => {
  beforeEach(() => preload.mockClear());

  it("asks the browser to fetch every picture of the question as an image", () => {
    rasmlarniOldindanYukla(savol("BILD_WORT", { options: ["https://m/1.jpg", "https://m/2.jpg"] }));
    expect(preload.mock.calls).toEqual([
      ["https://m/1.jpg", { as: "image" }],
      ["https://m/2.jpg", { as: "image" }],
    ]);
  });

  it("does nothing for a question without pictures", () => {
    rasmlarniOldindanYukla(savol("UZ_WORT", { options: ["a", "b"] }));
    expect(preload).not.toHaveBeenCalled();
  });
});
