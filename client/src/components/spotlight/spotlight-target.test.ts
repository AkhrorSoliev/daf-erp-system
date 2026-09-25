import { describe, expect, it } from "vitest";
import {
  resolveSpotlightTarget,
  routePath,
  spotlightBox,
  spotlightSelector,
  waitForSpotlightTarget,
} from "./spotlight-target";

describe("spotlight-target", () => {
  it("the data-tour selector", () => {
    expect(spotlightSelector("room-add")).toBe('[data-tour="room-add"]');
  });

  it("picks the first available candidate", () => {
    const dom: Record<string, string> = { '[data-tour="teacher-add"]': "add" };
    expect(
      resolveSpotlightTarget(["teacher-invite-link", "teacher-add"], (s) => dom[s] ?? null),
    ).toBe("add");
  });

  it("when both exist, picks the first one in order", () => {
    const dom: Record<string, string> = {
      '[data-tour="teacher-invite-link"]': "link",
      '[data-tour="teacher-add"]': "add",
    };
    expect(
      resolveSpotlightTarget(["teacher-invite-link", "teacher-add"], (s) => dom[s] ?? null),
    ).toBe("link");
  });

  it("none present → null", () => {
    expect(resolveSpotlightTarget(["x"], () => null)).toBeNull();
  });

  it("the box is 6px wider than the element on every side", () => {
    expect(spotlightBox({ top: 100, left: 50, width: 80, height: 32 })).toEqual({
      top: 94,
      left: 44,
      width: 92,
      height: 44,
    });
  });
});

describe("routePath", () => {
  it("returns a plain path unchanged", () => {
    expect(routePath("/settings/rooms")).toBe("/settings/rooms");
  });

  it("strips a query string", () => {
    expect(routePath("/settings/rooms?branch=7")).toBe("/settings/rooms");
  });

  it("strips a hash", () => {
    expect(routePath("/settings/rooms#top")).toBe("/settings/rooms");
  });

  it("strips a query string followed by a hash", () => {
    expect(routePath("/settings/rooms?branch=7#top")).toBe("/settings/rooms");
  });
});

/** Fake timer registry — `setTimer`/`clearTimer` without real `setTimeout`. */
function fakeTimers() {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimer: (cb: () => void) => {
      const id = ++nextId;
      pending.set(id, cb);
      return id;
    },
    clearTimer: (id: number) => {
      pending.delete(id);
    },
    fire: (id: number) => {
      const cb = pending.get(id);
      pending.delete(id);
      cb?.();
    },
    pendingCount: () => pending.size,
  };
}

/** Fake observer — `observe(cb)` returns a disconnect function, like `MutationObserver`. */
function fakeObserver() {
  let callback: (() => void) | null = null;
  let disconnects = 0;
  return {
    observe: (cb: () => void) => {
      callback = cb;
      return () => {
        disconnects++;
        callback = null;
      };
    },
    trigger: () => callback?.(),
    disconnectCount: () => disconnects,
  };
}

describe("waitForSpotlightTarget", () => {
  it("resolves immediately without observing or arming a timer", () => {
    const found: string[] = [];
    const timers = fakeTimers();
    const observer = fakeObserver();
    let observeCalls = 0;

    const cancel = waitForSpotlightTarget<string>({
      targets: ["a"],
      lookup: (selector) => (selector === spotlightSelector("a") ? "el-a" : null),
      observe: (cb) => {
        observeCalls++;
        return observer.observe(cb);
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      timeoutMs: 1000,
      onFound: (el) => found.push(el),
      onTimeout: () => {
        throw new Error("must not time out");
      },
    });

    expect(found).toEqual(["el-a"]);
    expect(observeCalls).toBe(0);
    expect(timers.pendingCount()).toBe(0);
    expect(() => cancel()).not.toThrow();
  });

  it("resolves after a later mutation, then disconnects and clears the timer", () => {
    let available = false;
    const found: string[] = [];
    const timers = fakeTimers();
    const observer = fakeObserver();

    waitForSpotlightTarget<string>({
      targets: ["a"],
      lookup: (selector) => (available && selector === spotlightSelector("a") ? "el-a" : null),
      observe: observer.observe,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      timeoutMs: 1000,
      onFound: (el) => found.push(el),
      onTimeout: () => {
        throw new Error("must not time out");
      },
    });

    expect(found).toEqual([]);
    available = true;
    observer.trigger();

    expect(found).toEqual(["el-a"]);
    expect(observer.disconnectCount()).toBe(1);
    expect(timers.pendingCount()).toBe(0);

    // A stray second mutation after being found must not call onFound again.
    observer.trigger();
    expect(found).toEqual(["el-a"]);
  });

  it("fires onTimeout exactly once and disconnects the observer", () => {
    const timers = fakeTimers();
    const observer = fakeObserver();
    let timeoutCalls = 0;

    waitForSpotlightTarget<string>({
      targets: ["a"],
      lookup: () => null,
      observe: observer.observe,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      timeoutMs: 1000,
      onFound: () => {
        throw new Error("must not find anything");
      },
      onTimeout: () => {
        timeoutCalls++;
      },
    });

    timers.fire(1);
    expect(timeoutCalls).toBe(1);
    expect(observer.disconnectCount()).toBe(1);

    // A stray mutation after timeout must not fire onFound or a second onTimeout.
    observer.trigger();
    expect(timeoutCalls).toBe(1);
  });

  it("cancel disconnects the observer and clears the timer without firing either callback", () => {
    const timers = fakeTimers();
    const observer = fakeObserver();
    const found: string[] = [];
    let timeoutCalls = 0;

    const cancel = waitForSpotlightTarget<string>({
      targets: ["a"],
      lookup: () => null,
      observe: observer.observe,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      timeoutMs: 1000,
      onFound: (el) => found.push(el),
      onTimeout: () => {
        timeoutCalls++;
      },
    });

    cancel();
    expect(observer.disconnectCount()).toBe(1);
    expect(timers.pendingCount()).toBe(0);

    // Cancelling twice, or a stray trigger afterwards, must stay inert.
    expect(() => cancel()).not.toThrow();
    observer.trigger();
    expect(found).toEqual([]);
    expect(timeoutCalls).toBe(0);
  });

  it("resolves candidates in priority order, like resolveSpotlightTarget", () => {
    const found: string[] = [];
    const timers = fakeTimers();
    const observer = fakeObserver();
    const dom: Record<string, string> = {
      [spotlightSelector("teacher-invite-link")]: "link",
      [spotlightSelector("teacher-add")]: "add",
    };

    waitForSpotlightTarget<string>({
      targets: ["teacher-invite-link", "teacher-add"],
      lookup: (selector) => dom[selector] ?? null,
      observe: observer.observe,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      timeoutMs: 1000,
      onFound: (el) => found.push(el),
      onTimeout: () => {},
    });

    expect(found).toEqual(["link"]);
  });
});
