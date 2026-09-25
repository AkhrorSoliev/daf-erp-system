import { describe, expect, it } from "vitest";
import { loadState } from "./load-state";

describe("loadState", () => {
  it("is ready whenever there is data, even when the latest refresh failed", () => {
    expect(loadState({ data: [], isError: true, isPaused: false })).toBe(
      "ready",
    );
  });

  it("is offline while the request waits for a connection", () => {
    expect(
      loadState({ data: undefined, isError: false, isPaused: true }),
    ).toBe("offline");
  });

  it("is offline, not failed, while a retry waits for a connection", () => {
    expect(loadState({ data: undefined, isError: true, isPaused: true })).toBe(
      "offline",
    );
  });

  it("is failed when the request came back with an error", () => {
    expect(
      loadState({ data: undefined, isError: true, isPaused: false }),
    ).toBe("failed");
  });

  it("is loading while a request can still answer", () => {
    expect(
      loadState({ data: undefined, isError: false, isPaused: false }),
    ).toBe("loading");
  });
});
