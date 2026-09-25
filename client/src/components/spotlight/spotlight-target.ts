/** Tour marker — the `data-tour` attribute (not a CSS class, which changes with styling). */
export function spotlightSelector(id: string): string {
  return `[data-tour="${id}"]`;
}

/**
 * Returns the first available candidate; order is priority (e.g. falls back
 * to «Yangi o'qituvchi» when «Havola olish» is not present). `lookup` looks at
 * the DOM — that is why this function is tested with a fake `lookup` in a
 * node test.
 */
export function resolveSpotlightTarget<T>(
  targets: string[],
  lookup: (selector: string) => T | null,
): T | null {
  for (const id of targets) {
    const found = lookup(spotlightSelector(id));
    if (found) return found;
  }
  return null;
}

export interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function spotlightBox(
  rect: { top: number; left: number; width: number; height: number },
  padding = 6,
): SpotlightBox {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * The path part of a route, with the query string and hash dropped.
 * `usePathname()` never includes either, so comparing a `LaunchStation`
 * route (which can carry a query, e.g. `/settings/rooms?branch=7`) against
 * it needs this — comparing the raw route always missed.
 */
export function routePath(route: string): string {
  return route.split(/[?#]/)[0];
}

export interface WaitForSpotlightTargetOptions<T> {
  /** `data-tour` candidates, in priority order — see `resolveSpotlightTarget`. */
  targets: string[];
  lookup: (selector: string) => T | null;
  /** Starts watching for DOM changes; returns a disconnect function. */
  observe: (callback: () => void) => () => void;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  timeoutMs: number;
  onFound: (target: T) => void;
  onTimeout: () => void;
}

/**
 * Waits for one of `targets` to appear: resolves immediately if already
 * present, otherwise watches via `observe` until found or `timeoutMs` elapses.
 * Extracted out of `spotlight-host.tsx` so the wait/observe/timeout logic can
 * be tested without a DOM — the host supplies real
 * `document.querySelector`/`MutationObserver`/`window.setTimeout` adapters.
 *
 * Returns a cancel function that stops watching without firing `onFound` or
 * `onTimeout` — the host calls it on cleanup (route change, unmount, or a
 * target already found through some other path).
 */
export function waitForSpotlightTarget<T>({
  targets,
  lookup,
  observe,
  setTimer,
  clearTimer,
  timeoutMs,
  onFound,
  onTimeout,
}: WaitForSpotlightTargetOptions<T>): () => void {
  const find = () => resolveSpotlightTarget(targets, lookup);

  const immediate = find();
  if (immediate) {
    onFound(immediate);
    return () => {};
  }

  let done = false;
  let disconnect: () => void = () => {};

  const finish = () => {
    done = true;
    disconnect();
    clearTimer(timerId);
  };

  disconnect = observe(() => {
    if (done) return;
    const el = find();
    if (!el) return;
    finish();
    onFound(el);
  });

  const timerId = setTimer(() => {
    if (done) return;
    finish();
    onTimeout();
  }, timeoutMs);

  return () => {
    if (done) return;
    finish();
  };
}
