import type { gsap as GsapNamed } from "gsap";

type Gsap = typeof GsapNamed;
type Rig = Record<string, number>;
export type RigState = "idle" | "wave" | "cheer" | "think" | "miss";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const tf = (x: number, y: number, t: string) => `translate(${x} ${y}) ${t} translate(${-x} ${-y})`;

const neytral = (): Rig => ({
  y: 0, sx: 1, sy: 1, rot: 0, eBL: 0, eBR: 0, happy: 0, winkR: 0, brw: 0,
  bLr: 0, bRr: 0, bLy: 0, bRy: 0, mw: 12, mc: 12, mo: 0, cheek: 0, stars: 0,
  q: 0, sw: 0, swy: 0, qy: 0, gxB: 0, gyB: 0,
});

export class DafiRig {
  private p: Record<string, SVGElement>;
  private r: Rig;
  private sp = { eL: { x: 0, v: 0 }, eR: { x: 0, v: 0 } };
  private prevY = 0;
  private prevR = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private gaze = { x: 0, y: 0 };
  private tl: gsap.core.Timeline | null = null;
  private idle: gsap.core.Tween[] = [];
  private tick = () => this.step();

  constructor(private root: HTMLElement, private gsap: Gsap, private opts: { reduce: boolean }) {
    const q = (s: string) => root.querySelector(s) as SVGElement;
    this.p = {
      sh: q(".sh"), all: q(".all"), eaL: q(".earL"), eaR: q(".earR"), eL: q(".eL"), eR: q(".eR"),
      gz: q(".gz"), hL: q(".hL"), hR: q(".hR"), bL: q(".bL"), bR: q(".bR"), mo: q(".mo"), tg: q(".tg"),
      chL: q(".chL"), chR: q(".chR"), fq: q(".fq"), fs: q(".fs"), fst: q(".fst"), fxl: q(".fxl"),
    };
    this.r = { ...neytral(), breath: 0, hidle: 0, blink: 0, gx: 0, gy: 0, eL: 0, eR: 0, starRot: 0 };
    gsap.ticker.add(this.tick);
    if (!opts.reduce) this.layers();
    this.render();
  }

  destroy() {
    this.gsap.ticker.remove(this.tick);
    this.gsap.killTweensOf(this.r);
    this.tl?.kill();
    this.timers.forEach(clearTimeout);
    this.idle.forEach((t) => t.kill());
  }

  private later(f: () => void, ms: number) {
    this.timers.push(setTimeout(f, ms));
  }

  /** Always-alive layer: breathing, blinking, wandering gaze, ear twitch. */
  private layers() {
    const { gsap, r } = this;
    this.idle = [
      gsap.to(r, { breath: 1, duration: 1.8, yoyo: true, repeat: -1, ease: "sine.inOut" }),
      gsap.to(r, { hidle: 1, duration: 2.6, yoyo: true, repeat: -1, ease: "sine.inOut" }),
    ];
    const blink = () => {
      if (!this.root.isConnected) return;
      gsap.to(r, { blink: 1, duration: 0.065, yoyo: true, repeat: Math.random() < 0.25 ? 3 : 1 });
      this.later(blink, 1800 + Math.random() * 3200);
    };
    this.later(blink, 900);
    const look = () => {
      this.gaze = { x: (Math.random() * 2 - 1) * 3.2, y: (Math.random() * 2 - 1) * 2 };
      this.later(look, 1400 + Math.random() * 2300);
    };
    look();
    const tw = () => {
      this.sp[Math.random() < 0.5 ? "eL" : "eR"].v += (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4);
      this.later(tw, 4500 + Math.random() * 5000);
    };
    this.later(tw, 2500);
  }

  private spr(s: { x: number; v: number }, t: number, k: number, d: number) {
    s.v += (t - s.x) * k;
    s.v *= d;
    s.x += s.v;
    return s.x;
  }

  private step() {
    const r = this.r;
    const vy = r.y - this.prevY;
    const vr = r.rot - this.prevR;
    this.prevY = r.y;
    this.prevR = r.rot;
    r.eL = this.spr(this.sp.eL, r.eBL - vy * 1.2 + vr * 1.4, 0.2, 0.82);
    r.eR = this.spr(this.sp.eR, r.eBR + vy * 1.2 + vr * 1.4, 0.2, 0.82);
    r.gx += (this.gaze.x + r.gxB - r.gx) * 0.18;
    r.gy += (this.gaze.y + r.gyB - r.gy) * 0.18;
    this.render();
  }

  private render() {
    const { r, p } = this;
    const br = r.breath;
    p.all.setAttribute("transform", tf(100, 135, `translate(0 ${r.y}) rotate(${r.rot + r.hidle * 1.2 - 0.6}) scale(${r.sx * (1 - 0.01 * br)} ${r.sy * (1 + 0.022 * br)})`));
    const sc = clamp(1 + r.y / 120, 0.4, 1.2);
    p.sh.setAttribute("transform", tf(100, 140, `scale(${sc} ${sc})`));
    p.sh.setAttribute("opacity", String(0.15 * sc));
    p.eaL.setAttribute("transform", tf(62, 64, `rotate(${r.eL})`));
    p.eaR.setAttribute("transform", tf(138, 64, `rotate(${r.eR})`));
    const bl = Math.max(r.blink, r.happy);
    p.eL.setAttribute("transform", tf(78, 80, `scale(1 ${1 - 0.93 * bl})`));
    p.eR.setAttribute("transform", tf(122, 80, `scale(1 ${1 - 0.93 * Math.max(bl, r.winkR)})`));
    p.eL.setAttribute("opacity", String(1 - r.happy));
    p.eR.setAttribute("opacity", String(1 - r.happy));
    p.gz.setAttribute("transform", `translate(${r.gx} ${r.gy})`);
    p.hL.setAttribute("opacity", String(r.happy));
    p.hR.setAttribute("opacity", String(r.happy));
    p.bL.setAttribute("opacity", String(r.brw));
    p.bR.setAttribute("opacity", String(r.brw));
    p.bL.setAttribute("transform", tf(78, 63, `translate(0 ${r.bLy}) rotate(${r.bLr})`));
    p.bR.setAttribute("transform", tf(122, 63, `translate(0 ${r.bRy}) rotate(${r.bRr})`));
    const L = 100 - r.mw;
    const R = 100 + r.mw;
    const y0 = 106;
    const open = r.mo > 0.04;
    p.mo.setAttribute("d", `M${L} ${y0} Q100 ${y0 + r.mc} ${R} ${y0}` + (open ? ` Q100 ${y0 + r.mc + r.mo * 40} ${L} ${y0}Z` : ""));
    p.mo.setAttribute("fill", open ? "#7a2a2a" : "none");
    p.tg.setAttribute("opacity", String(clamp(r.mo * 1.3 - 0.3, 0, 1)));
    p.tg.setAttribute("cy", String(106 + r.mc + r.mo * 22));
    const c = 1 + 0.28 * r.cheek;
    p.chL.setAttribute("transform", tf(66, 102, `scale(${c})`));
    p.chR.setAttribute("transform", tf(134, 102, `scale(${c})`));
    p.fq.setAttribute("opacity", String(r.q));
    p.fq.setAttribute("transform", `translate(0 ${r.qy})`);
    p.fs.setAttribute("opacity", String(r.sw));
    p.fs.setAttribute("transform", `translate(0 ${r.swy})`);
    p.fst.setAttribute("opacity", String(r.stars));
    p.fst.setAttribute("transform", tf(100, 80, `rotate(${r.starRot})`));
  }

  private dust() {
    const ns = "http://www.w3.org/2000/svg";
    ([-1, 1] as const).forEach((s) => {
      for (let i = 0; i < 3; i++) {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", String(100 + s * (30 + i * 8)));
        c.setAttribute("cy", "136");
        c.setAttribute("r", String(4 + i));
        c.setAttribute("fill", "#fff");
        c.setAttribute("opacity", "0.85");
        this.p.fxl.appendChild(c);
        this.gsap.to(c, {
          attr: { cx: 100 + s * (58 + i * 16), cy: 128 - i * 5, r: 1 },
          opacity: 0, duration: 0.55 + i * 0.1, ease: "power2.out", onComplete: () => c.remove(),
        });
      }
    });
  }

  set(state: RigState) {
    const { gsap, r } = this;
    this.tl?.kill();
    gsap.killTweensOf(r, Object.keys(neytral()).join(","));
    const tl = (this.tl = gsap.timeline({ defaults: { overwrite: "auto" } }));
    tl.to(r, { ...neytral(), duration: 0.35, ease: "back.out(1.6)" }, 0);
    if (this.opts.reduce) return;
    if (state === "wave") this.wave(tl, 0.3);
    else if (state === "cheer") this.cheer(tl, 0.12);
    else if (state === "think") this.think(tl, 0.3);
    else if (state === "miss") this.miss(tl, 0.1);
  }

  private wave(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { mw: 17, mc: 10, mo: 0.5, cheek: 1, brw: 1, bLy: -3, bRy: -3, rot: 5, duration: 0.45, ease: "back.out(2)" }, t)
      .to(r, { rot: -4, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.45)
      .to(r, { winkR: 1, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: 0.35 }, t + 0.9)
      .to(r, { winkR: 1, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: 0.35 }, t + 3.1);
  }

  private think(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { rot: -9, y: 1, gxB: 4, gyB: -4, brw: 1, bLr: -9, bLy: -5, mw: 8, mc: -1, mo: 0, q: 1, duration: 0.55, ease: "back.out(1.5)" }, t)
      .to(r, { qy: -7, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.55)
      .to(r, { rot: -12, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.6);
  }

  private miss(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { sy: 1.06, sx: 0.97, duration: 0.12, ease: "power2.out" }, t)
      .to(r, { sy: 1, sx: 1, rot: 6, eBL: -22, eBR: 22, brw: 1, bLr: -15, bRr: 15, mw: 5, mc: 2, mo: 0.5, gyB: 3, sw: 1, swy: -8, duration: 0.45, ease: "back.out(2.4)" }, t + 0.12)
      .to(r, { swy: 18, sw: 0, duration: 0.9, ease: "power1.in", repeat: -1, repeatDelay: 0.5 }, t + 0.5)
      .to(r, { rot: -5, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 5 }, t + 0.55);
  }

  /** Three bounces (anticipation, stretch, squash on landing, elastic return), then a wave. */
  private cheer(tl: gsap.core.Timeline, t0: number) {
    const r = this.r;
    let t = t0;
    const hop = (h: number, tilt: number) => {
      tl.to(r, { sy: 0.82, sx: 1.14, y: 3, mo: 0, happy: 0, duration: 0.17, ease: "power2.out" }, t);
      t += 0.17;
      tl.to(r, { y: -h, duration: 0.4, ease: "power2.out" }, t)
        .to(r, { sy: 1.12, sx: 0.93, rot: tilt, happy: 1, mw: 18, mc: 7, mo: 0.95, cheek: 1, stars: 1, brw: 0, duration: 0.3, ease: "back.out(2.2)" }, t);
      t += 0.4;
      tl.to(r, { y: 0, sy: 1.03, sx: 0.98, rot: -tilt * 0.4, duration: 0.34, ease: "power2.in" }, t);
      t += 0.34;
      tl.add(() => this.dust(), t).to(r, { sy: 0.76, sx: 1.2, rot: 0, duration: 0.08, ease: "power3.out" }, t);
      t += 0.08;
      tl.to(r, { sy: 1, sx: 1, duration: 0.7, ease: "elastic.out(1.1,.32)" }, t);
      t += 0.4;
    };
    tl.to(r, { starRot: 360, duration: 6, ease: "none", repeat: -1 }, t0);
    hop(30, -8);
    hop(40, 9);
    hop(52, -11);
    tl.add(() => this.set("wave"), t + 0.1);
  }
}
