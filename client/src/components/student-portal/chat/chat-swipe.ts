/** A finger on a bubble: where it went down, and whether it is a horizontal swipe. */
export interface SwipeState {
  x: number;
  y: number;
  /** True once the move is clearly sideways (to the left). */
  locked: boolean;
}

/** How far a bubble follows the finger, and how far releases an answer. */
export const SWIPE_MAX_PX = 56;
export const SWIPE_REPLY_PX = 44;
/** Movement before the direction is decided. */
const DECIDE_PX = 8;
const VERTICAL_PX = 10;

export type SwipeStep =
  | { cancel: true }
  | { cancel?: false; state: SwipeState; dx: number };

/**
 * One pointer move. A mostly vertical move cancels (the page is scrolling), a
 * clear move to the left locks the swipe, and a locked swipe reports how far
 * the bubble goes (never to the right, never past SWIPE_MAX_PX).
 */
export function swipeStep(s: SwipeState, x: number, y: number): SwipeStep {
  const mx = x - s.x;
  const my = y - s.y;
  if (!s.locked) {
    if (Math.abs(my) > VERTICAL_PX && Math.abs(my) > Math.abs(mx)) {
      return { cancel: true };
    }
    if (mx < -DECIDE_PX && Math.abs(mx) > Math.abs(my)) {
      return { state: { ...s, locked: true }, dx: Math.max(mx, -SWIPE_MAX_PX) };
    }
    return { state: s, dx: 0 };
  }
  return { state: s, dx: Math.min(0, Math.max(mx, -SWIPE_MAX_PX)) };
}

/** Released far enough to the left: answer the message. */
export const shouldReplyOnRelease = (dx: number): boolean =>
  dx <= -SWIPE_REPLY_PX;
