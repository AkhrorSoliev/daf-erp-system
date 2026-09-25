import { describe, expect, it } from "vitest";
import { isExerciseSessionRoute } from "./student-nav-items";

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
