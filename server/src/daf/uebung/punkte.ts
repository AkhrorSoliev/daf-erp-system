import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
} from '../../attendance/shared/date-utils';

/**
 * Bitta muddati kelgan so'zning bahosi.
 *
 * NEGA SO'Z UCHUN, SAVOL UCHUN EMAS. Leitner jadvali faqat so'zlarni
 * kuzatadi — gap va iborada "muddati keldi" degan tushuncha yo'q.
 * Ball savolga bog'lansa, gap tuzish savolini qayta-qayta yechib ball
 * yig'ish mumkin bo'lardi; so'zga bog'langanda esa qoida o'zi-o'zini
 * chegaralaydi, chunki javob berilgan so'z bugungi navbatdan chiqadi.
 */
export const PUNKTE_PRO_WORT = 10;

/**
 * Savolning bahosi — unga tegishli so'zlar bo'yicha.
 *
 * Ko'pchilik savol bitta so'zga tegishli, ya'ni ro'yxat bir elementli.
 * `PAAR` BUNDAN MUSTASNO: u to'rt so'zni birdan juftlaydi va server har
 * juftni alohida tekshiradi, shuning uchun to'rttasi ham shu yerga
 * tushadi va savol 40 ballgacha berishi mumkin.
 *
 * Gap va ibora savollarida ro'yxat BO'SH bo'ladi — natija nol.
 */
export function punkteFuer(
  woerter: Array<{ faellig: boolean; richtig: boolean }>,
): number {
  return woerter.reduce(
    (sum, w) => sum + (w.faellig && w.richtig ? PUNKTE_PRO_WORT : 0),
    0,
  );
}

export interface Stufe {
  de: string;
  uz: string;
  ab: number;
}

/**
 * Daraja narvoni — umumiy balldan kelib chiqadi va HECH QACHON nolga
 * tushmaydi. Haftalik jadval qisqa musobaqa, bu esa uzoq muddatli o'sish.
 *
 * Nomlari nemischa: maktab nemis tili o'rgatadi va o'quvchi yo'l-yo'lakay
 * oltita so'z oladi. `A1`/`A2`/`B1` dan ataylab boshqa oilaga tegishli —
 * ikkalasi bir ekranda turadi va chalkashmasligi kerak.
 */
export const STUFEN: ReadonlyArray<Stufe> = [
  { de: 'Anfänger', uz: 'Boshlovchi', ab: 0 },
  { de: 'Lerner', uz: "O'rganuvchi", ab: 300 },
  { de: 'Kenner', uz: 'Bilimdon', ab: 1_500 },
  { de: 'Könner', uz: 'Mohir', ab: 4_000 },
  { de: 'Profi', uz: 'Usta', ab: 9_000 },
  { de: 'Meister', uz: 'Ustoz', ab: 16_000 },
];

export function stufeFuer(gesamt: number): {
  jetzt: Stufe;
  naechste: Stufe | null;
} {
  let index = 0;
  for (let i = 0; i < STUFEN.length; i += 1) {
    if (gesamt >= STUFEN[i].ab) index = i;
  }
  return { jetzt: STUFEN[index], naechste: STUFEN[index + 1] ?? null };
}

/** Toshkent UTC+5, yozgi vaqt yo'q. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Joriy haftaning boshi — DUSHANBA, Toshkent yarim tuni, UTC lahzasi
 * sifatida.
 *
 * NEGA UTC EMAS. Dvigatelning `leitner.ts` fayli kunlarni UTC da sanaydi
 * va u yerda "Toshkentga o'tkazish keyingi rejaning ishi" deb yozib
 * qo'yilgan. Haftalik jadval uchun bu qarz shu yerda yopiladi: UTC bilan
 * hisoblansa jadval yakshanba kuni soat beshda yangilanardi va o'quvchi
 * uchun hafta noto'g'ri joyda uzilardi.
 */
export function wochenStartUtc(jetzt: Date): Date {
  const heute = tashkentDateStr(jetzt);
  const wochentag = dayOfWeekForDateStr(heute); // 0 = yakshanba
  const zurueck = wochentag === 0 ? 6 : wochentag - 1;
  const montag = addDaysToDateStr(heute, -zurueck);
  const [my, mm, md] = montag.split('-').map(Number);
  return new Date(Date.UTC(my, mm - 1, md) - TASHKENT_OFFSET_MS);
}

/**
 * Ketma-ket nechta kun mashq qilingan.
 *
 * `tage` — mashq qilingan Toshkent sanalari (`YYYY-MM-DD`), tartibi
 * ahamiyatsiz, takrorlanishi mumkin.
 *
 * BUGUN MASHQ QILINMAGAN BO'LSA SERIYA SAQLANADI: kun hali tugamagan,
 * ya'ni kechagi zanjir buzilmagan. Jazolamaslik dizayn qarori — o'quvchi
 * pul to'lab o'qiydi, uni ilova ichida ushlab turish kerak emas.
 */
export function serieAus(tage: string[], heute: string): number {
  const menge = new Set(tage);
  // Bugun bo'lmasa kechadan boshlanadi — yuqoridagi izohga qarang.
  let kursor = menge.has(heute) ? heute : addDaysToDateStr(heute, -1);
  let serie = 0;
  while (menge.has(kursor)) {
    serie += 1;
    kursor = addDaysToDateStr(kursor, -1);
  }
  return serie;
}
