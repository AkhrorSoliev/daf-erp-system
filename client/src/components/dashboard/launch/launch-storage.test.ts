import { describe, expect, it } from "vitest";
import { launchStorageKey, readLaunchFlag, writeLaunchFlag } from "./launch-storage";

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
