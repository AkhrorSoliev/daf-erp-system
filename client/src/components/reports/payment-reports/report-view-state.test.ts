import { describe, expect, it } from "vitest";
import { reportViewState, retryUnlessRefused } from "./report-view-state";

describe("reportViewState", () => {
  it("shows the error, not the spinner, when the request failed", () => {
    expect(reportViewState({ data: undefined, isError: true })).toBe("error");
  });
  it("is loading while nothing has arrived and nothing failed", () => {
    expect(reportViewState({ data: undefined, isError: false })).toBe(
      "loading",
    );
  });
  it("keeps the last good figures when a refetch fails", () => {
    expect(reportViewState({ data: { ok: 1 }, isError: true })).toBe("ready");
  });
});

describe("retryUnlessRefused", () => {
  it("does not retry a refusal", () => {
    expect(retryUnlessRefused(0, { response: { status: 400 } })).toBe(false);
    expect(retryUnlessRefused(0, { response: { status: 403 } })).toBe(false);
  });
  it("retries server and network errors up to three times", () => {
    expect(retryUnlessRefused(0, { response: { status: 500 } })).toBe(true);
    expect(retryUnlessRefused(3, new Error("Network Error"))).toBe(false);
  });
});
