import { describe, expect, it } from "vitest";
import {
  SWIPE_MAX_PX,
  SWIPE_REPLY_PX,
  shouldReplyOnRelease,
  swipeStep,
  type SwipeState,
} from "./chat-swipe";

const down: SwipeState = { x: 200, y: 300, locked: false };

describe("swipeStep", () => {
  it("waits while the move is tiny", () => {
    expect(swipeStep(down, 196, 301)).toEqual({ state: down, dx: 0 });
  });
  it("cancels a mostly vertical move: the page is scrolling", () => {
    expect(swipeStep(down, 195, 330)).toEqual({ cancel: true });
  });
  it("locks on a clear move to the left and follows the finger", () => {
    const step = swipeStep(down, 170, 302);
    expect(step).toMatchObject({ dx: -30, state: { locked: true } });
  });
  it("never moves to the right", () => {
    const locked = { ...down, locked: true };
    expect(swipeStep(locked, 260, 300)).toMatchObject({ dx: 0 });
  });
  it("stops at the maximum", () => {
    const locked = { ...down, locked: true };
    expect(swipeStep(locked, 0, 300)).toMatchObject({ dx: -SWIPE_MAX_PX });
  });
  it("a locked swipe is not cancelled by later vertical drift", () => {
    const locked = { ...down, locked: true };
    expect(swipeStep(locked, 150, 340)).toMatchObject({ dx: -50 });
  });
});

describe("shouldReplyOnRelease", () => {
  it("answers only from the threshold on", () => {
    expect(shouldReplyOnRelease(-SWIPE_REPLY_PX)).toBe(true);
    expect(shouldReplyOnRelease(-SWIPE_REPLY_PX + 1)).toBe(false);
    expect(shouldReplyOnRelease(0)).toBe(false);
  });
});
