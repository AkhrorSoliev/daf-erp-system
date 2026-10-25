import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motorniUygot = vi.fn();
vi.mock("./ovoz-motor", () => ({ motorniUygot, motorChal: vi.fn() }));

import { ovozniUygot } from "./ovoz";

function brauzer(ovoz: "0" | "1" | null) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => ovoz });
}

describe("ovozniUygot", () => {
  beforeEach(() => {
    motorniUygot.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wakes the audio engine for a student who has sound on", async () => {
    brauzer(null);
    ovozniUygot();
    await vi.waitFor(() => expect(motorniUygot).toHaveBeenCalledTimes(1));
  });

  it("leaves the engine alone for a muted student: no AudioContext is built or resumed", async () => {
    brauzer("0");
    ovozniUygot();
    // Let the dynamic import settle: had the call gone through, it would have run by now.
    await new Promise((r) => setTimeout(r, 20));
    expect(motorniUygot).not.toHaveBeenCalled();
  });
});
