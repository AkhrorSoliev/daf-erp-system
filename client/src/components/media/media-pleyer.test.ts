import { describe, expect, it } from "vitest";
import {
  BOSH_HOLAT,
  almashtir,
  navbatniOrnat,
  qoy,
  siljit,
  toxtat,
  tugadi,
  type PleyerHolati,
} from "./media-pleyer";

const navbat = [
  { id: "a", url: "/a.mp3", nom: "A" },
  { id: "b", url: "/b.mp3", nom: "B" },
  { id: "c", url: "/c.mp3", nom: "C" },
];
const h0: PleyerHolati = navbatniOrnat(BOSH_HOLAT, navbat);

describe("media player holati", () => {
  it("qoy — tanlangan element joriy bo'ladi va buyruq beradi", () => {
    const h = qoy(h0, "b");
    expect(h.joriyId).toBe("b");
    expect(h.amal.tur).toBe("qoy");
    expect(h.amal.n).toBe(h0.amal.n + 1);
  });
  it("navbatda yo'q id — holat o'zgarmaydi", () => {
    expect(qoy(h0, "z")).toBe(h0);
  });
  it("siljit — oxiridan keyin to'xtaydi, boshidan oldin birinchida qoladi", () => {
    expect(siljit(qoy(h0, "c"), 1).joriyId).toBeNull();
    expect(siljit(qoy(h0, "a"), -1).joriyId).toBe("a");
    expect(siljit(qoy(h0, "a"), 1).joriyId).toBe("b");
  });
  it("tugadi — ketma-ket rejimida keyingisiga o'tadi, aks holda joyida", () => {
    const h = qoy(h0, "a");
    expect(tugadi({ ...h, ketmaKet: true }).joriyId).toBe("b");
    expect(tugadi(h).joriyId).toBe("a");
    expect(tugadi(h).amal).toBe(h.amal);
  });
  it("navbat o'zgarsa to'xtaydi; o'sha navbat qayta berilsa — holat o'zgarmaydi", () => {
    const h = qoy(h0, "b");
    expect(navbatniOrnat(h, [...navbat])).toBe(h);
    const yangi = navbatniOrnat(h, navbat.slice(0, 1));
    expect(yangi.joriyId).toBeNull();
    expect(yangi.amal.tur).toBe("toxtat");
  });
  it("almashtir va toxtat buyruq beradi", () => {
    expect(almashtir(qoy(h0, "a")).amal.tur).toBe("almashtir");
    expect(almashtir(h0)).toBe(h0);
    expect(toxtat(qoy(h0, "a")).joriyId).toBeNull();
  });
});
