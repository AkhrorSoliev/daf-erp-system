import { afterEach, describe, expect, it, vi } from "vitest";
import { currentBuildInfo, formatBuildInfo, resolveBuildInfo } from "./build-info";

afterEach(() => vi.unstubAllEnvs());

describe("formatBuildInfo", () => {
  it("writes the date as dd.MM.yyyy and appends the commit", () => {
    expect(formatBuildInfo({ date: "2026-10-17", sha: "a1b2c3d" })).toBe(
      "Yangilangan: 17.10.2026 · a1b2c3d",
    );
  });

  it("keeps the local-build marker as is", () => {
    expect(formatBuildInfo({ date: "2026-10-17", sha: "dev" })).toBe(
      "Yangilangan: 17.10.2026 · dev",
    );
  });
});

describe("resolveBuildInfo", () => {
  it("returns null when the build date is missing (nothing honest to show)", () => {
    expect(resolveBuildInfo(undefined, "a1b2c3d")).toBeNull();
    expect(resolveBuildInfo("", "a1b2c3d")).toBeNull();
  });

  it("falls back to «dev» when the commit is missing or empty", () => {
    expect(resolveBuildInfo("2026-10-17", undefined)).toEqual({ date: "2026-10-17", sha: "dev" });
    expect(resolveBuildInfo("2026-10-17", "")).toEqual({ date: "2026-10-17", sha: "dev" });
  });

  it("passes a real commit through", () => {
    expect(resolveBuildInfo("2026-10-17", "a1b2c3d")).toEqual({ date: "2026-10-17", sha: "a1b2c3d" });
  });
});

describe("currentBuildInfo", () => {
  it("reads the two NEXT_PUBLIC variables next.config.ts sets", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "2026-10-17");
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "a1b2c3d");
    expect(currentBuildInfo()).toEqual({ date: "2026-10-17", sha: "a1b2c3d" });
  });

  it("is null when the date variable is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "");
    expect(currentBuildInfo()).toBeNull();
  });
});
