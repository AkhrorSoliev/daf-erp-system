/**
 * One place that may hold the user back from leaving a screen with unsaved
 * work (the attendance form registers itself here). Every «orqaga» the cabinet
 * draws — the form's own button, its bottom bar, Telegram's «←» — goes through
 * `requestLeave`, so they all ask the same question. A browser or hardware
 * «back» does not pass through here: the page cannot intercept it.
 */
type Handler = (leave: () => void) => void;

let handler: Handler | null = null;

/** Registers the guard; returns the function that removes it. */
export function registerLeaveGuard(h: Handler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Runs `leave` now, or after the guard's own confirmation. */
export function requestLeave(leave: () => void): void {
  if (handler) handler(leave);
  else leave();
}
