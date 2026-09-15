import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';

/** Dizayn 6.2: oxirgi 7 yoki 30 kun — kalendar oy emas. */
export type Davr = 7 | 30;

export function davrniOqi(qiymat: string | undefined): Davr {
  return qiymat === '30' ? 30 : 7;
}

export interface DavrOynasi {
  bugun: string;
  davrBoshi: string;
  /** max(davrBoshi, akkaunt kuni, kuzatuv boshi) — o'suvchi maxraj boshi. */
  hisobBoshi: string;
  maxraj: number;
  /** davrBoshi..bugun, o'sish tartibida. */
  kunlar: string[];
}

export function kunlarOrasi(a: string, b: string): number {
  return Math.round(
    (utcMidnightFromDateStr(b).getTime() -
      utcMidnightFromDateStr(a).getTime()) /
      86_400_000,
  );
}

const kattasi = (a: string, b: string) => (a > b ? a : b);

export function davrOynasi(
  davr: Davr,
  now: Date,
  akkauntYaratilgan: Date,
  kuzatuvBoshi: string | null,
): DavrOynasi {
  const bugun = tashkentDateStr(now);
  const davrBoshi = addDaysToDateStr(bugun, -(davr - 1));
  let hisobBoshi = kattasi(
    kattasi(davrBoshi, tashkentDateStr(akkauntYaratilgan)),
    kuzatuvBoshi ?? bugun,
  );
  if (hisobBoshi > bugun) hisobBoshi = bugun;
  const kunlar = Array.from({ length: davr }, (_, i) =>
    addDaysToDateStr(davrBoshi, i),
  );
  return {
    bugun,
    davrBoshi,
    hisobBoshi,
    maxraj: kunlarOrasi(hisobBoshi, bugun) + 1,
    kunlar,
  };
}
