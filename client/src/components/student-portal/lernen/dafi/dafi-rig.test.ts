import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DafiRig } from "./dafi-rig";

type Stub = { setAttribute: ReturnType<typeof vi.fn> };

/** A root whose `querySelector` hands out one stub per selector, and a gsap that only records calls. */
function fake() {
  const stubs = new Map<string, Stub>();
  const root = {
    isConnected: true,
    querySelector: (s: string) => {
      if (!stubs.has(s)) stubs.set(s, { setAttribute: vi.fn() });
      return stubs.get(s);
    },
  };
  const tween = { kill: vi.fn() };
  const timeline = { to: vi.fn(), add: vi.fn(), kill: vi.fn() };
  timeline.to.mockReturnValue(timeline);
  timeline.add.mockReturnValue(timeline);
  const gsap = {
    ticker: { add: vi.fn(), remove: vi.fn() },
    to: vi.fn(() => tween),
    timeline: vi.fn(() => timeline),
    killTweensOf: vi.fn(),
  };
  const rig = (reduce: boolean) =>
    new DafiRig(root as unknown as HTMLElement, gsap as never, { reduce });
  return { gsap, stubs, rig };
}

describe("DafiRig", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("under reduced motion draws no frames: no ticker, no timeline, destroy is safe", () => {
    const { gsap, rig } = fake();
    const r = rig(true);
    r.set("cheer");
    expect(gsap.ticker.add).not.toHaveBeenCalled();
    expect(gsap.timeline).not.toHaveBeenCalled();
    expect(gsap.to).not.toHaveBeenCalled();
    expect(() => r.destroy()).not.toThrow();
  });

  it("under reduced motion set() snaps to the calm pose and draws it once", () => {
    const { stubs, rig } = fake();
    const r = rig(true);
    const drawn = () => stubs.get(".all")!.setAttribute.mock.calls.length;
    const before = drawn();
    r.set("wave");
    expect(drawn()).toBe(before + 1);
  });

  it("with motion it ticks once and takes the ticker off when destroyed", () => {
    const { gsap, rig } = fake();
    const r = rig(false);
    expect(gsap.ticker.add).toHaveBeenCalledTimes(1);
    r.destroy();
    expect(gsap.ticker.remove).toHaveBeenCalledTimes(1);
    expect(gsap.ticker.remove).toHaveBeenCalledWith(gsap.ticker.add.mock.calls[0][0]);
  });
});
