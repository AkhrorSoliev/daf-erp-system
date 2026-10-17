import { describe, expect, it } from "vitest";
import de from "./dictionaries/de";
import en from "./dictionaries/en";
import ru from "./dictionaries/ru";
import uzCyrl from "./dictionaries/uz-cyrl";
import { loadDictionary } from "./load-dictionary";

describe("loadDictionary", () => {
  it("needs no dictionary for Uzbek", async () => {
    expect(await loadDictionary("uz")).toEqual({});
  });

  it("loads the dictionary of each other language", async () => {
    expect(await loadDictionary("ru")).toBe(ru);
    expect(await loadDictionary("de")).toBe(de);
    expect(await loadDictionary("en")).toBe(en);
    expect(await loadDictionary("uz-Cyrl")).toBe(uzCyrl);
  });
});
