import { describe, expect, it, vi } from "vitest";
import {
  createLaunchFlagStore,
  launchStorageKey,
  NO_LAUNCH_FLAGS,
  readLaunchFlag,
  writeLaunchFlag,
} from "./launch-storage";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("launch-storage", () => {
  it("the key carries both user and branch", () => {
    expect(launchStorageKey(90010, 2, "seen")).toBe("daf.launch.90010.2.seen");
  });

  it("a written flag is read back and does not leak to another user or branch", () => {
    const s = memoryStore();
    writeLaunchFlag(90010, 2, "seen", true, s);
    expect(readLaunchFlag(90010, 2, "seen", s)).toBe(true);
    expect(readLaunchFlag(90999, 2, "seen", s)).toBe(false);
    expect(readLaunchFlag(90010, 1, "seen", s)).toBe(false);
  });

  it("writing false clears the flag", () => {
    const s = memoryStore();
    writeLaunchFlag(90010, 2, "collapsed", true, s);
    writeLaunchFlag(90010, 2, "collapsed", false, s);
    expect(s.m.size).toBe(0);
  });

  it("no storage, or storage blocked — never throws", () => {
    const denied = () => {
      throw new Error("denied");
    };
    const broken = { getItem: denied, setItem: denied, removeItem: denied };
    expect(readLaunchFlag(1, 2, "seen", broken)).toBe(false);
    expect(() => writeLaunchFlag(1, 2, "seen", true, broken)).not.toThrow();
    expect(readLaunchFlag(1, 2, "seen", null)).toBe(false);
  });
});

describe("createLaunchFlagStore", () => {
  it("reads flags an earlier page load left in storage", () => {
    const s = memoryStore();
    writeLaunchFlag(90010, 2, "collapsed", true, s);
    const store = createLaunchFlagStore(() => s);
    expect(store.snapshot(90010, 2)).toEqual({ ...NO_LAUNCH_FLAGS, collapsed: true });
  });

  it("returns the same object until a flag changes (useSyncExternalStore compares by identity)", () => {
    const store = createLaunchFlagStore(() => memoryStore());
    const first = store.snapshot(90010, 2);
    expect(store.snapshot(90010, 2)).toBe(first);

    store.write(90010, 2, "seen", true);
    const second = store.snapshot(90010, 2);
    expect(second).not.toBe(first);
    expect(second.seen).toBe(true);
    expect(store.snapshot(90010, 2)).toBe(second);
  });

  it("a write persists to storage and wakes every subscriber until it unsubscribes", () => {
    const s = memoryStore();
    const store = createLaunchFlagStore(() => s);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.write(90010, 2, "launched", true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readLaunchFlag(90010, 2, "launched", s)).toBe(true);

    unsubscribe();
    store.write(90010, 2, "celebrated", true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps each user and branch apart", () => {
    const store = createLaunchFlagStore(() => memoryStore());
    store.write(90010, 2, "collapsed", true);
    expect(store.snapshot(90010, 2).collapsed).toBe(true);
    expect(store.snapshot(90999, 2).collapsed).toBe(false);
    expect(store.snapshot(90010, 1).collapsed).toBe(false);
  });

  it("where storage is blocked, a write still holds for the rest of the visit", () => {
    const denied = () => {
      throw new Error("denied");
    };
    const store = createLaunchFlagStore(() => ({
      getItem: denied,
      setItem: denied,
      removeItem: denied,
    }));

    expect(() => store.write(90010, 2, "collapsed", true)).not.toThrow();
    expect(store.snapshot(90010, 2).collapsed).toBe(true);
    store.write(90010, 2, "collapsed", false);
    expect(store.snapshot(90010, 2).collapsed).toBe(false);
  });
});
