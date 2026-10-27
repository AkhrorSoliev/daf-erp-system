import { describe, expect, it } from "vitest";
import { insertAtCaret, pushRecent, RECENT_MAX } from "./chat-emoji";

describe("insertAtCaret", () => {
  it("inserts at the caret and moves it behind the emoji", () => {
    expect(insertAtCaret("salom", 2, 2, "😀", 100)).toEqual({
      text: "sa😀lom",
      caret: 4,
    });
  });
  it("replaces a selection", () => {
    expect(insertAtCaret("salom", 0, 5, "👍", 100)).toEqual({
      text: "👍",
      caret: 2,
    });
  });
  it("appends at the end", () => {
    expect(insertAtCaret("a", 1, 1, "🙂", 100)?.text).toBe("a🙂");
  });
  it("refuses to pass the limit", () => {
    expect(insertAtCaret("abc", 3, 3, "😀", 4)).toBeNull();
  });
});

describe("pushRecent", () => {
  it("moves a repeat to the front", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });
  it("caps the list", () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => String(i));
    const next = pushRecent(full, "x");
    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe("x");
  });
});
