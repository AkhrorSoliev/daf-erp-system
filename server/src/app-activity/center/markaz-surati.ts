import { faolKunmi, Norma } from '../norma/norma';
import { DavrOynasi } from '../stats/davr';
import { KunSurati } from '../stats/davr-surati';

/**
 * SQL dan kelgan bir (o'quvchi, Toshkent kuni) seans qatori. Qirqish qoidasi
 * `kunlikYigindi()` bilan bir xil — SQL uni takrorlaydi (queries.ts),
 * `scripts/check-daf-markaz.ts` ikkisini solishtiradi.
 */
export interface KunlikSeans {
  studentId: number;
  /** `YYYY-MM-DD`, Toshkent kuni. */
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  lernenSoniya: number;
  kirdi: boolean;
}

/** Tugatilgan seanslardagi savollar, (o'quvchi, kun) bo'yicha. */
export interface KunlikSavol {
  studentId: number;
  sana: string;
  savollar: number;
  togri: number;
}

export interface OquvchiSurati {
  /** Davr kunlari tartib bilan; `shugullangan` bu yerda = faol kun (norma). */
  kunlar: KunSurati[];
  faolKun: number;
  lernenSoniya: number;
  faolSoniya: number;
  /** Davr ichida kamita bitta kunda kirdi. */
  kirdi: boolean;
  savollar: number;
  togri: number;
}

/**
 * Bitta o'quvchining davr surati — `davrSurati()` ning markaz varianti: kirish
 * seans satrlari emas, SQL allaqachon kunga yig'gan qatorlar. Hisob boshidan
 * oldingi kunlar (`kuzatilgan = false`) maxrajga kirmagani kabi yig'indiga ham
 * kirmaydi — aks holda «kuniga o'rtacha» maxrajdan katta chiqib qolardi.
 */
export function oquvchiSurati(
  oyna: DavrOynasi,
  seanslar: KunlikSeans[],
  savollar: KunlikSavol[],
  norma: Norma,
): OquvchiSurati {
  const seansMap = new Map(seanslar.map((s) => [s.sana, s]));
  const savolMap = new Map(savollar.map((s) => [s.sana, s]));

  let faolKun = 0;
  let lernenSoniya = 0;
  let faolSoniya = 0;
  let savolJami = 0;
  let togri = 0;
  let kirdi = false;

  const kunlar = oyna.kunlar.map((sana): KunSurati => {
    const s = seansMap.get(sana);
    const q = savolMap.get(sana);
    const kuzatilgan = sana >= oyna.hisobBoshi;
    const faol =
      kuzatilgan &&
      faolKunmi(s?.lernenSoniya ?? 0, q?.savollar ?? 0, norma);
    if (kuzatilgan) {
      if (faol) faolKun += 1;
      lernenSoniya += s?.lernenSoniya ?? 0;
      faolSoniya += s?.faolSoniya ?? 0;
      savolJami += q?.savollar ?? 0;
      togri += q?.togri ?? 0;
      if (s?.kirdi) kirdi = true;
    }
    return {
      sana,
      faolSoniya: s?.faolSoniya ?? 0,
      radioSoniya: s?.radioSoniya ?? 0,
      savollar: q?.savollar ?? 0,
      shugullangan: faol,
      kirdi: s?.kirdi ?? false,
      kuzatilgan,
    };
  });

  return { kunlar, faolKun, lernenSoniya, faolSoniya, kirdi, savollar: savolJami, togri };
}
