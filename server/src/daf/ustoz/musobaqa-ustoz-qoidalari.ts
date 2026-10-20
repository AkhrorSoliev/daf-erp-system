import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { darajaNomi } from '../liga/liga-qoidalari';
import { MAQSAD_BALL, maqsadDarajasi, serieAus } from '../uebung/punkte';
import type {
  AzoBalli,
  AzoKunlari,
  AzoMalumoti,
  MusobaqaOquvchi,
} from './musobaqa-ustoz.types';

/** Tarix: joriy haftadan oldingi shuncha hafta (spec S5 §4). */
export const TARIX_HAFTALARI = 8;
/** Seriya uchun kunlar oynasi. ponytail: 400 kundan uzun seriya kesiladi (loyiha 2026-09 da boshlangan). */
export const KUN_OYNASI = 400;

/** Joriy hafta + oldingi 8 dushanba, yangidan eskiga. */
export function haftalarRoyxati(joriyHafta: string): string[] {
  return Array.from({ length: TARIX_HAFTALARI + 1 }, (_, i) =>
    addDaysToDateStr(joriyHafta, -7 * i),
  );
}

/** `undefined` = joriy hafta. Ro'yxatda yo'q (dushanba emas, kelajak, 8 haftadan eski) = `null`. */
export function haftaniTanla(
  param: string | undefined,
  joriyHafta: string,
): string | null {
  const hafta = param ?? joriyHafta;
  return haftalarRoyxati(joriyHafta).includes(hafta) ? hafta : null;
}

/** Spec S5 §4: shu guruh bali EMAS, jami ball — boshqa guruhda mashq qilgan «qilmadi»ga tushmasin. */
export function mashqQilmaganlar<T extends { jamiBall: number }>(
  qatorlar: readonly T[],
): T[] {
  return qatorlar.filter((q) => q.jamiBall === 0);
}

export function oquvchiQatorlari(input: {
  azolar: AzoMalumoti[];
  ballar: AzoBalli[];
  kunlar: AzoKunlari[];
  joriy: boolean;
  bugun: string;
}): MusobaqaOquvchi[] {
  const ballar = new Map(input.ballar.map((b) => [b.studentId, b]));
  const kunlar = new Map(input.kunlar.map((k) => [k.studentId, k]));
  return input.azolar
    .map((a): MusobaqaOquvchi => {
      const b = ballar.get(a.studentId);
      const k = kunlar.get(a.studentId);
      const tage = k?.tage ?? [];
      return {
        studentId: a.studentId,
        ism: a.ism,
        akkaunt: a.akkaunt,
        guruhBali: b?.guruhBali ?? 0,
        jamiBall: b?.jamiBall ?? 0,
        faolKunlar: b?.faolKunlar ?? 0,
        seriya: input.joriy ? serieAus(tage, input.bugun) : null,
        bugunBali: input.joriy ? (k?.bugunBali ?? 0) : null,
        maqsadBali: input.joriy
          ? MAQSAD_BALL[maqsadDarajasi(a.dailyGoal)]
          : null,
        liga: darajaNomi(a.tier),
        nishonlar: a.nishonlar,
        oxirgiMashq: tage.length
          ? tage.reduce((x, y) => (x > y ? x : y))
          : null,
      };
    })
    .sort(
      (x, y) =>
        y.jamiBall - x.jamiBall ||
        x.ism.localeCompare(y.ism, 'uz') ||
        x.studentId - y.studentId,
    );
}
