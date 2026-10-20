import { describe, expect, it } from "vitest";
import {
  buildPatch,
  candidatesText,
  draftErrors,
  fieldError,
  isDirty,
  isValid,
  previewThreshold,
  summaryText,
  toDraft,
  type AbsencePauseSettings,
} from "./absence-pause-draft";

const saved: AbsencePauseSettings = {
  enabled: false,
  warnThreshold: 2,
  pauseThreshold: 3,
  dailyCap: 10,
};

describe("toDraft", () => {
  it("keeps numbers as text so a cleared field stays cleared", () => {
    expect(toDraft(saved)).toEqual({ enabled: false, warn: "2", pause: "3", cap: "10" });
  });
});

describe("fieldError", () => {
  it("asks for a value instead of treating an empty field as 0", () => {
    expect(fieldError("warn", "")).toBe("Qiymatni kiriting");
    expect(fieldError("warn", "  ")).toBe("Qiymatni kiriting");
  });
  it("uses the server's ranges", () => {
    expect(fieldError("warn", "0")).toBe("1 dan 10 gacha bo'lishi kerak");
    expect(fieldError("warn", "10")).toBeNull();
    expect(fieldError("warn", "11")).not.toBeNull();
    expect(fieldError("pause", "1")).toBe("2 dan 20 gacha bo'lishi kerak");
    expect(fieldError("pause", "20")).toBeNull();
    expect(fieldError("cap", "100")).toBeNull();
    expect(fieldError("cap", "101")).not.toBeNull();
  });
});

describe("draftErrors", () => {
  it("flags a warn threshold that is not below the pause threshold", () => {
    const d = { ...toDraft(saved), warn: "3", pause: "3" };
    expect(draftErrors(d).order).toBe("Xabar chegarasi pauza chegarasidan kichik bo'lishi kerak");
    expect(isValid(d)).toBe(false);
  });
  it("does not report the order while a field is itself invalid", () => {
    const d = { ...toDraft(saved), warn: "", pause: "3" };
    expect(draftErrors(d).order).toBeNull();
    expect(draftErrors(d).warn).toBe("Qiymatni kiriting");
  });
  it("accepts the saved values", () => {
    expect(isValid(toDraft(saved))).toBe(true);
  });
});

describe("isDirty and buildPatch", () => {
  it("is clean when nothing changed", () => {
    expect(isDirty(saved, toDraft(saved))).toBe(false);
    expect(buildPatch(saved, toDraft(saved))).toEqual({});
  });
  it("sends only the changed fields", () => {
    const d = { ...toDraft(saved), enabled: true, pause: "4" };
    expect(isDirty(saved, d)).toBe(true);
    expect(buildPatch(saved, d)).toEqual({ enabled: true, pauseThreshold: 4 });
  });
  it("counts an edited but invalid field as a change, without putting it in the patch", () => {
    const d = { ...toDraft(saved), cap: "" };
    expect(isDirty(saved, d)).toBe(true);
    expect(buildPatch(saved, d)).toEqual({});
  });
  it("is clean again when the user types the old value back", () => {
    const d = { ...toDraft(saved), pause: "9" };
    expect(isDirty(saved, d)).toBe(true);
    expect(isDirty(saved, { ...d, pause: "3" })).toBe(false);
  });
});

describe("summaryText", () => {
  it("states what the thresholds do", () => {
    expect(summaryText(toDraft(saved))).toBe(
      "O'quvchi ketma-ket 2 ta dars qoldirsa xabar oladi, 3 ta qoldirsa pauzaga o'tadi.",
    );
  });
  it("is silent while the numbers are not usable", () => {
    expect(summaryText({ ...toDraft(saved), warn: "" })).toBeNull();
    expect(summaryText({ ...toDraft(saved), warn: "5", pause: "3" })).toBeNull();
  });
});

describe("previewThreshold", () => {
  it("asks only when the rule would be on and something is unsaved", () => {
    expect(previewThreshold(saved, toDraft(saved))).toBeNull();
    expect(previewThreshold(saved, { ...toDraft(saved), enabled: true })).toBe(3);
    expect(previewThreshold(saved, { ...toDraft(saved), pause: "4" })).toBeNull();
    const on = { ...saved, enabled: true };
    expect(previewThreshold(on, { ...toDraft(on), pause: "4" })).toBe(4);
  });
  it("does not ask while the pause threshold is invalid", () => {
    expect(previewThreshold(saved, { ...toDraft(saved), enabled: true, pause: "" })).toBeNull();
  });
});

describe("candidatesText", () => {
  it("says nobody is affected", () => {
    expect(candidatesText(0, 3, 10)).toEqual({
      tone: "info",
      text: "Hozir 3 va undan ko'p dars qoldirgan o'quvchi yo'q.",
    });
  });
  it("says who the next run would pause", () => {
    const r = candidatesText(7, 3, 10);
    expect(r.tone).toBe("warning");
    expect(r.text).toContain("Hozir 7 nafar o'quvchi 3 va undan ko'p dars qoldirgan.");
    expect(r.text).toContain("07:30");
  });
  it("warns that nobody is paused when the daily cap is exceeded", () => {
    const r = candidatesText(12, 3, 10);
    expect(r.text).toContain("kunlik chegaradan (10) ko'p");
    expect(r.text).toContain("hech kim pauzalanmaydi");
  });
});
