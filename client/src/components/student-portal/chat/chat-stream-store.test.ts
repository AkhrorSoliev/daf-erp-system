import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TYPING_SHOW_MS, useChatStream } from "./chat-stream-store";

describe("typing store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useChatStream.getState().clearTyping("c1");
    vi.useRealTimers();
  });

  it("shows typing and clears it after the timeout", () => {
    useChatStream.getState().markTyping("c1");
    expect("c1" in useChatStream.getState().typing).toBe(true);
    vi.advanceTimersByTime(TYPING_SHOW_MS + 1);
    expect("c1" in useChatStream.getState().typing).toBe(false);
  });

  it("a new ping restarts the timer", () => {
    useChatStream.getState().markTyping("c1");
    vi.advanceTimersByTime(TYPING_SHOW_MS - 1000);
    useChatStream.getState().markTyping("c1");
    vi.advanceTimersByTime(TYPING_SHOW_MS - 1000);
    expect("c1" in useChatStream.getState().typing).toBe(true);
  });

  it("clearTyping hides it at once", () => {
    useChatStream.getState().markTyping("c1");
    useChatStream.getState().clearTyping("c1");
    expect("c1" in useChatStream.getState().typing).toBe(false);
  });
});
