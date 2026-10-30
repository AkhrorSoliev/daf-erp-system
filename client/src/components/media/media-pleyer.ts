import * as React from "react";
import { create } from "zustand";

/** Navbatdagi bitta ovoz: so'z, gap, dialog yoki savol. */
export interface PleyerElement {
  id: string;
  url: string;
  nom: string;
}

export interface PleyerHolati {
  navbat: PleyerElement[];
  joriyId: string | null;
  ketmaKet: boolean;
  tezlik: 1 | 0.8;
  /** `<audio>` hozir chalyaptimi — panel hodisalardan yozadi. */
  ijroda: boolean;
  /** Panelga buyruq; `n` har safar o'sadi, shu bilan bir xil buyruq ham qayta ishlaydi. */
  amal: { tur: "qoy" | "almashtir" | "toxtat"; n: number };
}

export const BOSH_HOLAT: PleyerHolati = {
  navbat: [],
  joriyId: null,
  ketmaKet: false,
  tezlik: 1,
  ijroda: false,
  amal: { tur: "toxtat", n: 0 },
};

const buyruq = (h: PleyerHolati, tur: PleyerHolati["amal"]["tur"]) => ({ tur, n: h.amal.n + 1 });

export function navbatniOrnat(h: PleyerHolati, navbat: PleyerElement[]): PleyerHolati {
  const bir = navbat.length === h.navbat.length && navbat.every((e, i) => e.id === h.navbat[i].id);
  if (bir) return h;
  return { ...h, navbat, joriyId: null, ijroda: false, amal: buyruq(h, "toxtat") };
}

export function qoy(h: PleyerHolati, id: string): PleyerHolati {
  if (!h.navbat.some((e) => e.id === id)) return h;
  return { ...h, joriyId: id, amal: buyruq(h, "qoy") };
}

export function almashtir(h: PleyerHolati): PleyerHolati {
  return h.joriyId ? { ...h, amal: buyruq(h, "almashtir") } : h;
}

export function toxtat(h: PleyerHolati): PleyerHolati {
  return { ...h, joriyId: null, ijroda: false, amal: buyruq(h, "toxtat") };
}

export function siljit(h: PleyerHolati, qadam: 1 | -1): PleyerHolati {
  const i = h.navbat.findIndex((e) => e.id === h.joriyId);
  if (i < 0) return h.navbat.length ? qoy(h, h.navbat[0].id) : h;
  const j = Math.max(0, i + qadam);
  return j >= h.navbat.length ? toxtat(h) : qoy(h, h.navbat[j].id);
}

export function tugadi(h: PleyerHolati): PleyerHolati {
  return h.ketmaKet ? siljit(h, 1) : h;
}

export function joriyElement(h: PleyerHolati): PleyerElement | null {
  return h.navbat.find((e) => e.id === h.joriyId) ?? null;
}

interface PleyerAmallari {
  ornat: (navbat: PleyerElement[]) => void;
  qoyId: (id: string) => void;
  almashtirish: () => void;
  keyingi: () => void;
  oldingi: () => void;
  tugashi: () => void;
  toxtatish: () => void;
  setIjroda: (b: boolean) => void;
  setKetmaKet: (b: boolean) => void;
  setTezlik: (t: 1 | 0.8) => void;
}

/** /media'dagi YAGONA player: bir vaqtda faqat bitta ovoz chaladi. */
export const useMediaPleyer = create<PleyerHolati & PleyerAmallari>((set) => ({
  ...BOSH_HOLAT,
  ornat: (navbat) => set((h) => navbatniOrnat(h, navbat)),
  qoyId: (id) => set((h) => qoy(h, id)),
  almashtirish: () => set((h) => almashtir(h)),
  keyingi: () => set((h) => siljit(h, 1)),
  oldingi: () => set((h) => siljit(h, -1)),
  tugashi: () => set((h) => tugadi(h)),
  toxtatish: () => set((h) => toxtat(h)),
  setIjroda: (ijroda) => set({ ijroda }),
  setKetmaKet: (ketmaKet) => set({ ketmaKet }),
  setTezlik: (tezlik) => set({ tezlik }),
}));

/** Panel ko'rinib turgan paytdagi navbat; panel yopilsa navbat bo'shaydi. */
export function useNavbat(navbat: PleyerElement[]) {
  const ornat = useMediaPleyer((s) => s.ornat);
  React.useEffect(() => {
    ornat(navbat);
  }, [navbat, ornat]);
  React.useEffect(() => () => ornat([]), [ornat]);
}

export function useJoriyMi(id: string): boolean {
  return useMediaPleyer((s) => s.joriyId === id);
}
