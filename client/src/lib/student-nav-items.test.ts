import { describe, expect, it } from "vitest";
import { isBottomNavHiddenRoute } from "./student-nav-items";

/**
 * The exercise session (`SeansEkrani`) renders its own fixed bottom action
 * bar in the same spot as the floating bottom nav, so the nav must not
 * render on the two routes that mount it — see the function's own doc
 * comment for the production finding this closes.
 */
describe("isBottomNavHiddenRoute", () => {
  it("hides the nav on a lesson session, with or without a trailing slash", () => {
    expect(isBottomNavHiddenRoute("/portal/lernen/lessons/12")).toBe(true);
    expect(isBottomNavHiddenRoute("/portal/lernen/lessons/12/")).toBe(true);
  });

  it("hides the nav on the review (wiederholung) session, with or without a trailing slash", () => {
    expect(isBottomNavHiddenRoute("/portal/lernen/wiederholung")).toBe(true);
    expect(isBottomNavHiddenRoute("/portal/lernen/wiederholung/")).toBe(true);
  });

  it("keeps the nav everywhere else", () => {
    expect(isBottomNavHiddenRoute("/portal")).toBe(false);
    expect(isBottomNavHiddenRoute("/portal/lernen")).toBe(false);
    expect(isBottomNavHiddenRoute("/portal/lernen/units/5")).toBe(false);
    expect(isBottomNavHiddenRoute("/portal/lernen/reyting")).toBe(false);
    expect(isBottomNavHiddenRoute("/portal/radio")).toBe(false);
    expect(isBottomNavHiddenRoute("/portal/schedule")).toBe(false);
  });
});
