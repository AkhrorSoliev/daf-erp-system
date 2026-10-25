import { describe, expect, it } from "vitest";
import {
  featureEnabled,
  isChatThreadRoute,
  isExerciseSessionRoute,
  studentNavItems,
} from "./student-nav-items";

/**
 * The exercise session (`SeansEkrani`) renders its own fixed bottom action
 * bar in the same spot as the floating bottom nav and the docked radio
 * player, so neither may render on the two routes that mount it — see the
 * function's own doc comment for the production findings this closes.
 */
describe("isExerciseSessionRoute", () => {
  it("hides the nav on a lesson session, with or without a trailing slash", () => {
    expect(isExerciseSessionRoute("/portal/lernen/lessons/12")).toBe(true);
    expect(isExerciseSessionRoute("/portal/lernen/lessons/12/")).toBe(true);
  });

  it("hides the nav on the review (wiederholung) session, with or without a trailing slash", () => {
    expect(isExerciseSessionRoute("/portal/lernen/wiederholung")).toBe(true);
    expect(isExerciseSessionRoute("/portal/lernen/wiederholung/")).toBe(true);
  });

  it("keeps the nav everywhere else", () => {
    expect(isExerciseSessionRoute("/portal")).toBe(false);
    expect(isExerciseSessionRoute("/portal/lernen")).toBe(false);
    expect(isExerciseSessionRoute("/portal/lernen/units/5")).toBe(false);
    expect(isExerciseSessionRoute("/portal/lernen/reyting")).toBe(false);
    expect(isExerciseSessionRoute("/portal/radio")).toBe(false);
    expect(isExerciseSessionRoute("/portal/schedule")).toBe(false);
  });
});

describe("isChatThreadRoute", () => {
  it("owns the bottom edge on a thread, with or without a trailing slash", () => {
    expect(isChatThreadRoute("/portal/chat/abc123")).toBe(true);
    expect(isChatThreadRoute("/portal/chat/abc123/")).toBe(true);
  });

  it("keeps the nav on the list, new chat and settings pages", () => {
    expect(isChatThreadRoute("/portal/chat")).toBe(false);
    expect(isChatThreadRoute("/portal/chat/")).toBe(false);
    expect(isChatThreadRoute("/portal/chat/new")).toBe(false);
    expect(isChatThreadRoute("/portal/chat/settings")).toBe(false);
    expect(isChatThreadRoute("/portal/radio")).toBe(false);
  });
});

describe("featureEnabled", () => {
  const chat = studentNavItems.find((i) => i.url === "/portal/chat");
  const home = studentNavItems.find((i) => i.url === "/portal");

  it("has the Chat item in the Ko'proq slot behind the chat feature", () => {
    expect(chat?.slot).toBe("more");
    expect(chat?.feature).toBe("chat");
  });

  it("drops a feature item while its feature is off", () => {
    expect(featureEnabled(chat!, { chat: false })).toBe(false);
    expect(featureEnabled(chat!, { chat: true })).toBe(true);
  });

  it("never touches an item without a feature", () => {
    expect(featureEnabled(home!, { chat: false })).toBe(true);
  });
});
