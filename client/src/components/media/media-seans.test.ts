import { describe, expect, it } from "vitest";
import type { VorschauFrage } from "./media-fragen-types";
import { kalitla, seansGuruhlari, seansNavbati } from "./media-seans";

function f(format: VorschauFrage["format"], itemId: number, audioUrl: string | null = null): VorschauFrage {
  return { format, itemType: "WORT", itemId, prompt: `p${itemId}`, hilfe: null, options: [], richtig: "r", audioUrl };
}

describe("media seans", () => {
  const fragen = kalitla([f("WORT_UZ", 1), f("ARTIKEL", 2), f("AUDIO_WORT", 3, "/a3"), f("WORT_UZ", 4)]);

  it("har savolga barqaror kalit beradi", () => {
    expect(fragen.map((x) => x.kalit)).toEqual(["f0", "f1", "f2", "f3"]);
  });

  it("afzal formatlar oldin, qolgani birinchi uchrashuv tartibida", () => {
    const g = seansGuruhlari(fragen, ["AUDIO_WORT", "ARTIKEL"]);
    expect(g.map((x) => [x.format, x.afzal])).toEqual([
      ["AUDIO_WORT", true],
      ["ARTIKEL", true],
      ["WORT_UZ", false],
    ]);
    expect(g[2].fragen.map((x) => x.itemId)).toEqual([1, 4]);
  });

  it("navbat — faqat ovozli savollar, guruhlar tartibida", () => {
    const g = seansGuruhlari(fragen, []);
    expect(seansNavbati(g)).toEqual([{ id: "f2", url: "/a3", nom: "p3" }]);
  });
});
