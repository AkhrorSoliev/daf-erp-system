import { KUCH_ORALIQ, SAVOL_SONI } from './jang-qoidalari';
import { aralashtir } from './savol-tanlash';

export interface RuhNomzodi {
  battleId: number;
  studentId: number;
  questionIds: number[];
  egaKuchi: number;
}

export interface RuhSharti {
  menId: number;
  menKuchi: number;
  /** O'quvchi o'tgan unitlardagi `APPROVED` savollar. */
  ruxsatSavollar: Set<number>;
  /** Oxirgi 3 kunda ko'rilgan savollar. */
  korilgan: Set<number>;
  /** 7 kun ichida ruhi bilan o'ynalgan egalar. */
  uchrashganlar: Set<number>;
}

/**
 * Ruh — BITTA tugagan jang: o'quvchi uning 6 savolini aynan o'sha tartibda
 * oladi, chunki ruh javoblari shu savollarga berilgan (spec §6).
 */
export function ruhniTanla(
  nomzodlar: RuhNomzodi[],
  shart: RuhSharti,
  rng: () => number = Math.random,
): RuhNomzodi | null {
  const mos = nomzodlar.filter(
    (n) =>
      n.studentId !== shart.menId &&
      !shart.uchrashganlar.has(n.studentId) &&
      n.questionIds.length === SAVOL_SONI &&
      n.questionIds.every(
        (q) => shart.ruxsatSavollar.has(q) && !shart.korilgan.has(q),
      ) &&
      // 1e-9: 0.75 − 0.6 suzuvchi nuqtada 0.15000000000000002 chiqadi.
      Math.abs(n.egaKuchi - shart.menKuchi) <= KUCH_ORALIQ + 1e-9,
  );
  return aralashtir(mos, rng)[0] ?? null;
}
