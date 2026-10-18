import type { NishonQatori } from "./types";

/**
 * Nishon nomi KALITDAN quriladi (serverda matn yo'q, spec S2 2.3):
 * `SERIE_14` → «14 kun ketma-ket», `WOERTER_150` → «150 ta so'z».
 */
export function nishonNomi(key: string): string {
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return key;
  const n = Number(m[2]);
  if (m[1] === "SERIE") return `${n} kun ketma-ket`;
  return n === 592 ? "A1 so'zlarining hammasi" : `${n} ta so'z`;
}

/** Olinmagan nishonning ostidagi yozuv; olinganda `null`. */
export function nishonQoldi(q: NishonQatori): string | null {
  if (q.olingan) return null;
  if (!q.qoldi) return "Keyingi mashqda beriladi";
  return q.tur === "SERIE" ? `yana ${q.qoldi} kun` : `yana ${q.qoldi} ta so'z`;
}
