import { describe, expect, it } from "vitest";
import { accessView } from "./chat-access-view";
import type { ChatAccess, ChatLockReason } from "./chat-types";

const quota = {
  windowDays: 7,
  activeMin: 40,
  radioMin: 10,
  quota: { activeMin: 60, radioMin: 30 },
  ok: true,
  missingActiveMin: 0,
  missingRadioMin: 0,
  tomorrow: null,
};

function access(over: Partial<ChatAccess> = {}): ChatAccess {
  return {
    enabled: true,
    canWrite: true,
    reasons: [],
    messages: [],
    warning: null,
    quota,
    ...over,
  };
}

const REASONS: ChatLockReason[] = [
  "BANNED",
  "DEBT",
  "GENDER",
  "BIRTH_DATE",
  "PHONE",
  "QUOTA",
];

describe("accessView", () => {
  it("is open when there is nothing to say", () => {
    const v = accessView(access());
    expect(v.mode).toBe("open");
    expect(v.lines).toEqual([]);
  });

  it.each(REASONS.filter((r) => r !== "BANNED"))(
    "locks on %s and passes the server lines through",
    (reason) => {
      const v = accessView(
        access({ canWrite: false, reasons: [reason], messages: ["matn"] }),
      );
      expect(v.mode).toBe("locked");
      expect(v.lines).toEqual(["matn"]);
    },
  );

  it("BANNED wins over every other reason", () => {
    const v = accessView(
      access({
        canWrite: false,
        reasons: ["DEBT", "BANNED", "QUOTA"],
        messages: ["a", "b", "c"],
      }),
    );
    expect(v.mode).toBe("banned");
    expect(v.lines).toEqual(["a", "b", "c"]);
  });

  it("warns only while canWrite and a warning exists", () => {
    const w = accessView(access({ warning: "Ertaga yopiladi" }));
    expect(w.mode).toBe("warning");
    expect(w.lines).toEqual(["Ertaga yopiladi"]);
    const locked = accessView(
      access({ canWrite: false, reasons: ["QUOTA"], messages: ["x"], warning: "w" }),
    );
    expect(locked.mode).toBe("locked");
    expect(locked.lines).toEqual(["x"]);
  });

  it("stays locked when canWrite is false even with no reasons", () => {
    expect(accessView(access({ canWrite: false })).mode).toBe("locked");
  });

  it("draws progress bars only for a QUOTA lock", () => {
    const lock = (reasons: ChatLockReason[]) =>
      accessView(access({ canWrite: false, reasons, messages: ["x"] })).progress;
    expect(lock(["QUOTA"])).toEqual({
      activeHave: 40,
      activeNeed: 60,
      radioHave: 10,
      radioNeed: 30,
    });
    expect(lock(["DEBT"])).toBeNull();
    expect(lock(["PHONE", "GENDER"])).toBeNull();
    expect(lock(["BANNED", "QUOTA"])).toBeNull();
    expect(accessView(access({ warning: "w" })).progress).toBeNull();
    expect(accessView(access()).progress).toBeNull();
  });
});
