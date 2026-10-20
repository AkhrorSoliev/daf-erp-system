import { describe, expect, it } from "vitest";
import { draftErrors, fieldError, isDirty, isValid, normText, toDraft, toNorma, type DafNorma } from "./daf-norma-draft";

const saved: DafNorma = { kunlikDaqiqa: 20, kunlikSavol: 30, haftalikKun: 5, sariqKun: 3 };

describe("fieldError", () => {
  it("asks for a value instead of reading an empty field as 0", () => {
    expect(fieldError("kunlikDaqiqa", "")).toBe("Qiymatni kiriting");
  });
  it("uses the server's ranges", () => {
    expect(fieldError("kunlikDaqiqa", "1440")).toBeNull();
    expect(fieldError("kunlikDaqiqa", "1441")).toBe("1 dan 1440 gacha bo'lishi kerak");
    expect(fieldError("haftalikKun", "8")).toBe("1 dan 7 gacha bo'lishi kerak");
    expect(fieldError("kunlikSavol", "0")).not.toBeNull();
  });
});

describe("draftErrors", () => {
  it("flags a yellow limit that is not below the green one", () => {
    const d = { ...toDraft(saved), sariqKun: "5" };
    expect(draftErrors(d).order).toBe("Sariq chegarasi yashil chegaradan kichik bo'lishi kerak");
    expect(isValid(d)).toBe(false);
  });
  it("does not report the order while a field is itself invalid", () => {
    expect(draftErrors({ ...toDraft(saved), sariqKun: "" }).order).toBeNull();
  });
  it("accepts the saved values", () => {
    expect(isValid(toDraft(saved))).toBe(true);
  });
});

describe("isDirty and toNorma", () => {
  it("is clean for the saved values and dirty after an edit", () => {
    expect(isDirty(saved, toDraft(saved))).toBe(false);
    expect(isDirty(saved, { ...toDraft(saved), kunlikSavol: "31" })).toBe(true);
  });
  it("turns a valid draft back into numbers", () => {
    expect(toNorma({ ...toDraft(saved), kunlikSavol: "31" })).toEqual({ ...saved, kunlikSavol: 31 });
  });
});

describe("normText", () => {
  it("states the norm with the yellow range", () => {
    expect(normText(toDraft(saved))).toContain("kuniga kamida 20 daqiqa");
    expect(normText(toDraft(saved))).toContain("3–4 kun bo'lsa — sariq");
  });
  it("names a single yellow day", () => {
    expect(normText({ ...toDraft(saved), sariqKun: "4" })).toContain("4 kun bo'lsa — sariq");
  });
  it("points the way while the values are not usable", () => {
    expect(normText({ ...toDraft(saved), sariqKun: "" })).toBe(
      "Qiymatlar to'g'rilangach, normaning izohi shu yerda ko'rinadi.",
    );
  });
});
