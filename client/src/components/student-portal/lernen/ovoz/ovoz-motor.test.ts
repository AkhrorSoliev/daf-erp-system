import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OvozHodisa } from "./ovoz-qoidalari";

// A recording AudioContext: just enough of the Web Audio graph for the synthesis to run in node.
const chastotalar: number[] = [];

class Param {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  value = 0;
}

class Tugun {
  connect<T>(boshqa: T): T {
    return boshqa;
  }
  start(): void {}
  stop(): void {}
}

// An oscillator's frequency: every value it is given, set directly or by a ramp, is written down.
class ChastotaParam {
  setValueAtTime(v: number): void {
    chastotalar.push(v);
  }
  exponentialRampToValueAtTime(v: number): void {
    chastotalar.push(v);
  }
  set value(v: number) {
    chastotalar.push(v);
  }
}

class Oscillator extends Tugun {
  frequency = new ChastotaParam();
}

class SohtaAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = new Tugun();
  resume = () => Promise.resolve();
  createBuffer = (_kanal: number, uzunlik: number) => ({ getChannelData: () => new Float32Array(uzunlik) });
  createOscillator = () => new Oscillator();
  createDynamicsCompressor = () =>
    Object.assign(new Tugun(), {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    });
  createConvolver = () => Object.assign(new Tugun(), { buffer: null as unknown });
  createGain = () => Object.assign(new Tugun(), { gain: new Param() });
  createStereoPanner = () => Object.assign(new Tugun(), { pan: new Param() });
  createBiquadFilter = () =>
    Object.assign(new Tugun(), { type: "", frequency: new Param(), Q: new Param(), gain: new Param() });
  createBufferSource = () =>
    Object.assign(new Tugun(), { buffer: null as unknown, playbackRate: new Param() });
}

const HODISALAR: OvozHodisa[] = ["bos", "togri", "xato", "qulf", "unitOchildi", "mukofot"];

describe("motorChal", () => {
  beforeEach(() => {
    chastotalar.length = 0;
    vi.resetModules();
    vi.stubGlobal("window", { AudioContext: SohtaAudioContext });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Browsers clamp an oscillator to ±24 kHz and log a warning each time; nothing above
  // ~20 kHz is audible anyway. The reward's random shimmer reached about 32 kHz.
  it("never asks an oscillator for a frequency above 20 kHz, whichever sound plays", async () => {
    const { motorChal } = await import("./ovoz-motor");
    // The shimmer is random: play the reward many times so a stray high partial would show.
    for (let i = 0; i < 100; i++) motorChal("mukofot");
    for (const hodisa of HODISALAR) motorChal(hodisa);

    expect(chastotalar.length).toBeGreaterThan(0);
    expect(Math.max(...chastotalar)).toBeLessThanOrEqual(20_000);
  });

  it("keeps the audible partials: the bright notes still sound", async () => {
    const { motorChal } = await import("./ovoz-motor");
    for (const hodisa of HODISALAR) motorChal(hodisa);
    // The glass bell's top note (C7) has a partial near 11.5 kHz: it must survive the clamp.
    expect(chastotalar.some((hz) => hz > 10_000 && hz <= 20_000)).toBe(true);
  });
});
