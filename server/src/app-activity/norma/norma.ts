/**
 * DaF faollik normasi va o'quvchi holati — YAGONA manba (dizayn 3.3–3.4).
 *
 * SQL faqat mexanik yig'indi qaytaradi (kunlik LERNEN soniyasi, tugatilgan
 * seanslardagi savollar); «bu kun faolmi» va «bu o'quvchi qizilmi» degan
 * qaror FAQAT shu yerda. ADR-0015 dagi saboq: qoida ikki joyda bo'lsa, ikki
 * ekran ikki xil son ko'rsatadi va buni hech kim sezmaydi — chunki ikki son
 * ikki boshqa ekranda turadi.
 */
export interface Norma {
  /** Kunlik eng kam LERNEN vaqti, daqiqa. Radio va boshqa bo'limlar kirmaydi. */
  kunlikDaqiqa: number;
  /** Kunlik eng kam savol — tugatilgan seanslarda. Vaqt YOKI savol, bittasi yetadi. */
  kunlikSavol: number;
  /** Haftada eng kam faol kun — yashil chegarasi. */
  haftalikKun: number;
  /** Sariq chegarasi, haftada faol kun. Har doim `< haftalikKun`. */
  sariqKun: number;
}

/** Boshlang'ich qiymatlar — taxminiy; haqiqiysi `Company` ustunlarida. */
export const STANDART_NORMA: Norma = {
  kunlikDaqiqa: 10,
  kunlikSavol: 12,
  haftalikKun: 4,
  sariqKun: 2,
};

export type Holat =
  | 'AKKAUNT_YOQ'
  | 'HECH_KIRMAGAN'
  | 'QIZIL'
  | 'SARIQ'
  | 'YASHIL';

export const HOLATLAR: readonly Holat[] = [
  'HECH_KIRMAGAN',
  'QIZIL',
  'SARIQ',
  'YASHIL',
  'AKKAUNT_YOQ',
];

/**
 * Standart saralash — eng muammolisi yuqorida (dizayn 6.2). Akkauntsiz oxirida:
 * u bilan ish boshqa (akkaunt ochish), ilovaga undash emas.
 */
export const HOLAT_TARTIBI: Record<Holat, number> = {
  HECH_KIRMAGAN: 0,
  QIZIL: 1,
  SARIQ: 2,
  YASHIL: 3,
  AKKAUNT_YOQ: 4,
};

export function normaniOqi(company: {
  dafKunlikDaqiqa: number;
  dafKunlikSavol: number;
  dafHaftalikKun: number;
  dafSariqKun: number;
}): Norma {
  return {
    kunlikDaqiqa: company.dafKunlikDaqiqa,
    kunlikSavol: company.dafKunlikSavol,
    haftalikKun: company.dafHaftalikKun,
    sariqKun: company.dafSariqKun,
  };
}

/**
 * Faol kun: LERNEN vaqti normaga yetdi YOKI tugatilgan seanslarda savol
 * normaga yetdi. «Yoki» — tez o'quvchi 6 daqiqada ishini qiladi, takrorlash
 * seansi esa darsni tugatmaydi; ikkalasi ham jazolanmasligi kerak.
 */
export function faolKunmi(
  lernenSoniya: number,
  savollar: number,
  norma: Norma,
): boolean {
  return (
    lernenSoniya >= norma.kunlikDaqiqa * 60 || savollar >= norma.kunlikSavol
  );
}

/**
 * Norma davrga mutanosib: 7 kunda 4 → 30 kunda 17. Maxraj o'suvchi (yangi
 * akkaunt to'liq davr uchun javobgar emas), shuning uchun eng kami 1 — aks
 * holda ikki kunlik o'quvchi 0 kun bilan yashil bo'lib qolardi.
 */
export function kerakliKunlar(
  maxraj: number,
  norma: Norma,
): { kerakliKun: number; sariqKerak: number } {
  const m = Math.max(1, maxraj);
  return {
    kerakliKun: Math.max(1, Math.round((norma.haftalikKun * m) / 7)),
    sariqKerak: Math.max(1, Math.round((norma.sariqKun * m) / 7)),
  };
}

export function holat(
  input: {
    akkaunt: boolean;
    hechKirmagan: boolean;
    faolKun: number;
    maxraj: number;
  },
  norma: Norma,
): Holat {
  if (!input.akkaunt) return 'AKKAUNT_YOQ';
  if (input.hechKirmagan) return 'HECH_KIRMAGAN';
  const { kerakliKun, sariqKerak } = kerakliKunlar(input.maxraj, norma);
  if (input.faolKun >= kerakliKun) return 'YASHIL';
  if (input.faolKun >= sariqKerak) return 'SARIQ';
  return 'QIZIL';
}
