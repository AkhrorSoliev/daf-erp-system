/**
 * Web Audio synthesis of the Ta'lim effects (ADR-0125). Bright, soft, little
 * reverb: kalimba + plucked harp (Karplus-Strong) + glass bell (inharmonic
 * modes) + a filtered-noise "whoosh". Ported from the approved mockup
 * (docs/superpowers/mockups/2026-10-24-lernen-dizayn/sfx.js, "v4"). No audio
 * files: nothing to license or load.
 */
import type { OvozHodisa } from "./ovoz-qoidalari";

interface Zanjir {
  c: AudioContext;
  bus: GainNode;
  ks: Map<number, { buf: AudioBuffer; n: number }>;
}

let zanjir: Zanjir | null = null;

const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093, E7: 2637,
} as const;

const R = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Nothing above ~20 kHz is audible, and browsers log a warning for every oscillator
 * set past ±24 kHz (the reward's glass shimmer reached about 32 kHz). A partial above
 * this is not created at all.
 */
const ENG_YUQORI_CHASTOTA = 20_000;

function qur(): Zanjir {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new Ctor();
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 12;
  lim.ratio.value = 6;
  lim.attack.value = 0.002;
  lim.release.value = 0.25;
  lim.connect(c.destination);
  // short, damped stereo reverb (1 s), pre-delay 30 ms; wet is small on purpose
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.0);
  const pre = Math.floor(sr * 0.03);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += (0.08 + 0.82 * (1 - x)) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, 2.6) * (i < pre + 400 ? (i - pre) / 400 : 1);
    }
  }
  const rev = c.createConvolver();
  rev.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.11;
  rev.connect(wet).connect(lim);
  const bus = c.createGain();
  bus.gain.value = 0.85;
  const hs = c.createBiquadFilter();
  hs.type = "highshelf";
  hs.frequency.value = 3500;
  hs.gain.value = 4;
  bus.connect(hs).connect(lim);
  const send = c.createGain();
  send.gain.value = 0.9;
  bus.connect(send).connect(rev);
  return { c, bus, ks: new Map() };
}

function olish(): Zanjir {
  if (!zanjir) zanjir = qur();
  return zanjir;
}

/** Resume the context from a user gesture (browsers keep it suspended before). */
export function motorniUygot(): void {
  const z = olish();
  if (z.c.state === "suspended") z.c.resume().catch(() => {});
}

function out(z: Zanjir, node: AudioNode, pan = 0) {
  const p = z.c.createStereoPanner();
  p.pan.value = pan;
  node.connect(p).connect(z.bus);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tick(z: Zanjir, t: number, vol: number, freq: number, pan: number) {
  const c = z.c;
  const n = c.createBufferSource();
  const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.02), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  n.buffer = b;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.5;
  const g = c.createGain();
  g.gain.value = vol;
  n.connect(f).connect(g);
  out(z, g, pan);
  n.start(t);
}

function kalimba(z: Zanjir, f: number, t: number, vol = 0.3, pan = 0, d = 0.7) {
  const c = z.c;
  const g = c.createGain();
  env(g, t, 0.008, vol, d);
  out(z, g, pan);
  ([[1, 1, d], [5.4, 0.3, d * 0.2], [12.1, 0.05, d * 0.08]] as const).forEach(([r, a, dd]) => {
    if (f * r * 1.012 > ENG_YUQORI_CHASTOTA) return;
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.setValueAtTime(f * r * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f * r, t + 0.04);
    og.gain.setValueAtTime(a, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dd);
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dd + 0.1);
  });
  tick(z, t, vol * 0.12, 4200, pan);
}

function glass(z: Zanjir, f: number, t: number, vol = 0.15, d = 2, pan = 0) {
  const c = z.c;
  const g = c.createGain();
  env(g, t, 0.012, vol, d);
  out(z, g, pan);
  ([[1, 1, 1], [2.756, 0.62, 0.7], [5.404, 0.36, 0.5], [8.933, 0.12, 0.28]] as const).forEach(([r, a, k]) =>
    ([-0.9, 0.9] as const).forEach((det) => {
      const hz = f * r + det * (r > 1 ? 1.6 : 1);
      if (hz > ENG_YUQORI_CHASTOTA) return;
      const o = c.createOscillator();
      const og = c.createGain();
      o.frequency.value = hz;
      og.gain.setValueAtTime(a * 0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + d * k);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + d * k + 0.1);
    }),
  );
}

/** Karplus-Strong string: one buffer per pitch, cached. */
function harp(z: Zanjir, f: number, t: number, vol = 0.35, pan = 0, d = 1.1) {
  const c = z.c;
  const sr = c.sampleRate;
  const nn = Math.max(2, Math.round(sr / f));
  let ent = z.ks.get(nn);
  if (!ent) {
    const buf = c.createBuffer(1, sr * 2, sr);
    const d0 = buf.getChannelData(0);
    const ring = new Float32Array(nn);
    for (let i = 0; i < nn; i++) ring[i] = Math.random() * 2 - 1;
    for (let p = 0; p < 2; p++) for (let i = 0; i < nn; i++) ring[i] = (ring[i] + ring[(i + 1) % nn]) / 2;
    let idx = 0;
    for (let i = 0; i < d0.length; i++) {
      const nx = (idx + 1) % nn;
      d0[i] = ring[idx];
      ring[idx] = 0.9965 * (ring[idx] + ring[nx]) / 2;
      idx = nx;
    }
    ent = { buf, n: nn };
    z.ks.set(nn, ent);
  }
  const s = c.createBufferSource();
  const g = c.createGain();
  s.buffer = ent.buf;
  s.playbackRate.value = (f * ent.n) / sr;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(15000, f * 14);
  s.connect(lp).connect(g);
  env(g, t, 0.008, vol, d);
  out(z, g, pan);
  s.start(t);
  s.stop(t + d + 0.1);
}

function air(z: Zanjir, t: number, dur: number, from: number, to: number, vol = 0.1, p0 = -0.8, p1 = 0.8) {
  const c = z.c;
  const n = c.createBufferSource();
  const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = b;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = c.createStereoPanner();
  p.pan.setValueAtTime(p0, t);
  p.pan.linearRampToValueAtTime(p1, t + dur);
  n.connect(f).connect(g).connect(p).connect(z.bus);
  n.start(t);
}

function sub(z: Zanjir, t: number, vol = 0.15, f0 = 120, f1 = 42, d = 0.35) {
  const c = z.c;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
  o.connect(g).connect(z.bus);
  env(g, t, 0.004, vol, d);
  o.start(t);
  o.stop(t + d + 0.1);
}

const HODISALAR: Record<OvozHodisa, (z: Zanjir, t: number) => void> = {
  bos: (z, t) => {
    kalimba(z, N.G5, t, 0.26, 0, 0.25);
    glass(z, N.G6, t, 0.035, 0.5, 0);
  },
  togri: (z, t) => {
    kalimba(z, N.E5, t, 0.3, -0.15, 0.5);
    kalimba(z, N.G5, t + 0.07, 0.3, 0, 0.5);
    kalimba(z, N.C6, t + 0.14, 0.34, 0.15, 0.8);
    glass(z, N.C7, t + 0.14, 0.09, 1.5, 0.2);
    glass(z, N.G6, t + 0.18, 0.06, 1.4, -0.2);
  },
  xato: (z, t) => {
    // a soft, kind "oops": two falling kalimba notes, never a buzzer
    kalimba(z, N.E5 * 0.5, t, 0.26, -0.1, 0.45);
    kalimba(z, N.C5 * 0.5, t + 0.11, 0.26, 0.1, 0.7);
    glass(z, N.G5, t + 0.11, 0.02, 0.6, 0);
  },
  qulf: (z, t) => {
    kalimba(z, N.C5 * 0.5, t, 0.18, 0, 0.14);
    tick(z, t, 0.1, 1800, 0);
  },
  unitOchildi: (z, t) => {
    air(z, t, 0.6, 600, 7000, 0.09);
    sub(z, t + 0.42, 0.15);
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => harp(z, f, t + 0.3 + i * 0.06, 0.32, -0.6 + i * 0.24, 1.2));
    glass(z, N.C6, t + 0.66, 0.12, 2.4, -0.2);
    glass(z, N.G6, t + 0.68, 0.1, 2.4, 0.25);
    glass(z, N.E7, t + 0.72, 0.06, 2, 0);
  },
  mukofot: (z, t) => {
    sub(z, t, 0.17, 150, 48, 0.35);
    air(z, t, 0.55, 700, 7500, 0.09);
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7].forEach((f, i) => harp(z, f, t + 0.08 + i * 0.065, 0.3, -0.7 + i * 0.23, 1.4));
    const e = t + 0.62;
    [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => glass(z, f, e, 0.13, 3, -0.45 + i * 0.3));
    kalimba(z, N.G5, e, 0.24, -0.3, 0.9);
    kalimba(z, N.C6, e + 0.1, 0.26, 0, 0.9);
    kalimba(z, N.E6, e + 0.2, 0.28, 0.3, 1.2);
    sub(z, e, 0.12, 110, 50, 0.3);
    for (let i = 0; i < 9; i++) glass(z, R(1800, 3600), e + 0.2 + i * 0.085, R(0.025, 0.05), 0.9, R(-0.9, 0.9));
  },
};

export function motorChal(hodisa: OvozHodisa): void {
  const z = olish();
  if (z.c.state === "suspended") z.c.resume().catch(() => {});
  HODISALAR[hodisa](z, z.c.currentTime);
}
