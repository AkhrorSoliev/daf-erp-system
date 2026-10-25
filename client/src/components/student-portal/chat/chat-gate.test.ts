import { describe, expect, it } from "vitest";
import { chatGateState } from "./chat-gate";

const base = { data: undefined, isError: false, isPaused: false, error: null };
const httpError = (status: number) => ({ response: { status } });

describe("chatGateState", () => {
  it("waits while the access answer is loading", () => {
    expect(chatGateState(base)).toBe("loading");
  });

  it("opens only when the switch is on", () => {
    expect(chatGateState({ ...base, data: { enabled: true } })).toBe("open");
    expect(chatGateState({ ...base, data: { enabled: false } })).toBe("closed");
  });

  it("treats 403 and 404 as a switched-off chat", () => {
    for (const status of [403, 404]) {
      expect(
        chatGateState({ ...base, isError: true, error: httpError(status) }),
      ).toBe("closed");
    }
  });

  it("never reads a network failure or a 500 as switched off", () => {
    expect(
      chatGateState({ ...base, isError: true, error: httpError(500) }),
    ).toBe("failed");
    expect(chatGateState({ ...base, isError: true, error: new Error("x") })).toBe(
      "failed",
    );
    expect(chatGateState({ ...base, isPaused: true })).toBe("failed");
  });
});
