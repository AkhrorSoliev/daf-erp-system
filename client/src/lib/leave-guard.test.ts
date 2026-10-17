import { describe, expect, it, vi } from "vitest";
import { registerLeaveGuard, requestLeave } from "./leave-guard";

describe("requestLeave", () => {
  it("leaves at once when nothing guards the screen", () => {
    const leave = vi.fn();
    requestLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("hands the leaving to the guard, which decides when it runs", () => {
    const leave = vi.fn();
    const remove = registerLeaveGuard((go) => {
      expect(leave).not.toHaveBeenCalled();
      go();
    });
    requestLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
    remove();
  });

  it("does not leave while the guard holds the user back", () => {
    const leave = vi.fn();
    const remove = registerLeaveGuard(() => undefined);
    requestLeave(leave);
    expect(leave).not.toHaveBeenCalled();
    remove();
  });

  it("stops guarding once the guard is removed", () => {
    const remove = registerLeaveGuard(() => undefined);
    remove();
    const leave = vi.fn();
    requestLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("a stale remove does not drop a newer guard", () => {
    const removeOld = registerLeaveGuard(() => undefined);
    const removeNew = registerLeaveGuard(() => undefined);
    removeOld();
    const leave = vi.fn();
    requestLeave(leave);
    expect(leave).not.toHaveBeenCalled();
    removeNew();
  });
});
