import { describe, expect, it } from "vitest";
import { canUndoWriteOff } from "./debt-write-off-actions";

describe("canUndoWriteOff", () => {
  const original = { reversedAt: null, reversedTransactionId: null };
  it("lets the CEO undo an original still in effect", () => {
    expect(canUndoWriteOff(true, original)).toBe(true);
  });
  it("never offers undo to anyone but the CEO", () => {
    expect(canUndoWriteOff(false, original)).toBe(false);
  });
  it("hides undo on an original already undone", () => {
    expect(canUndoWriteOff(true, { reversedAt: "2026-09-20T10:00:00.000Z", reversedTransactionId: null })).toBe(false);
  });
  it("hides undo on the undo row itself", () => {
    expect(canUndoWriteOff(true, { reversedAt: null, reversedTransactionId: "tx-orig" })).toBe(false);
  });
});
