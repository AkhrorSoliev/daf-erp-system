import { describe, expect, it } from "vitest";
import { artikelKlasse, artikelTeilen } from "./artikel-farbe";

describe("artikelTeilen", () => {
  it("splits a leading article", () => {
    expect(artikelTeilen("der Bahnhof")).toEqual({
      artikel: "der",
      rest: "Bahnhof",
    });
    expect(artikelTeilen("die Post")).toEqual({ artikel: "die", rest: "Post" });
    expect(artikelTeilen("das Auto")).toEqual({ artikel: "das", rest: "Auto" });
  });

  it("leaves text without an article alone", () => {
    expect(artikelTeilen("Eltern")).toEqual({ artikel: null, rest: "Eltern" });
    expect(artikelTeilen("Guten Morgen")).toEqual({
      artikel: null,
      rest: "Guten Morgen",
    });
    expect(artikelTeilen("salom")).toEqual({ artikel: null, rest: "salom" });
  });

  it("treats a bare article as an article with no rest (ARTIKEL options)", () => {
    expect(artikelTeilen("das")).toEqual({ artikel: "das", rest: "" });
  });

  it("does not split a sentence, even one that starts with an article", () => {
    expect(artikelTeilen("Der Bus ist neu.")).toEqual({
      artikel: null,
      rest: "Der Bus ist neu.",
    });
    expect(artikelTeilen("die Frau ist nett")).toEqual({
      artikel: null,
      rest: "die Frau ist nett",
    });
  });

  it("splits only a capitalised noun — «der erste» stays plain", () => {
    expect(artikelTeilen("der erste")).toEqual({
      artikel: null,
      rest: "der erste",
    });
  });
});

describe("artikelKlasse", () => {
  it("maps each article to its token class", () => {
    expect(artikelKlasse("der")).toBe("text-artikel-der");
    expect(artikelKlasse("die")).toBe("text-artikel-die");
    expect(artikelKlasse("das")).toBe("text-artikel-das");
    expect(artikelKlasse(null)).toBe("");
  });
});
