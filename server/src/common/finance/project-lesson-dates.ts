import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
} from '../../attendance/shared/date-utils';

/**
 * "Bu pul qachongacha yetadi?" — oldindan to'langan, hali O'TILMAGAN darslarni
 * guruh jadvali bo'yicha oldinga proyeksiya qiladi.
 *
 * Nima uchun kerak
 * ----------------
 * `Lesson` jadvali yo'q: dars faqat davomat belgilanganda `Attendance` qatori
 * bo'lib tug'iladi. Shuning uchun ledger replay'da oldindan to'langan bo'lakning
 * sanasi `null` bo'ladi va to'lov kartasi "10 ta darsga yetdi · 12.08 — 19.08"
 * deb yozardi: son 10 ta darsni, sana esa faqat o'tib bo'lgan 3 tasini
 * tasvirlardi (#10601).
 *
 * Bu FAKT emas, PROYEKSIYA
 * ------------------------
 * Qaytgan sana bayram, bekor qilingan dars yoki jadval o'zgarishidan keyin
 * suriladi. Shuning uchun chaqiruvchi uni "taxminan" deb belgilashi SHART —
 * uni o'tib bo'lgan darslarning haqiqiy sanasi bilan bir xil ko'rinishda
 * ko'rsatish yana o'sha "ishonchli ko'rinadigan yolg'on son" bo'lardi.
 *
 * Bilib turib MODELLASHTIRILMAGAN narsalar: o'quvchining kelajakdagi
 * davomati (ABSENT ham to'lanadi, demak sana surilmaydi), guruhning
 * to'xtatilishi, hali e'lon qilinmagan bayramlar. Bularning hammasi sanani
 * faqat KEYINGA suradi, hech qachon oldinga emas — ya'ni proyeksiya eng erta
 * ehtimolni beradi.
 */
export interface ProjectionInput {
  /** Shu sanadan KEYIN boshlanadi (odatda oxirgi o'tilgan dars sanasi). */
  afterDateStr: string;
  /** Nechta dars proyeksiya qilinsin. */
  count: number;
  /** Sana → o'sha kundagi dars kunlari (JS weekday). `null` = noma'lum davr. */
  resolveScheduleDays: (dateStr: string) => number[] | null;
  /** Dars o'tilmaydigan sanalar: bayramlar + bekor qilingan darslar. */
  skipDates: Set<string>;
  /** Guruh shu sanadan keyin dars o'tmaydi (`endDate`), bo'lmasa `null`. */
  lastPossibleDateStr?: string | null;
}

/**
 * Cheksiz sikldan himoya: jadval bo'sh bo'lsa (masalan `exactDays` yo'q)
 * kalendar bo'ylab abadiy yurmaslik uchun. Haftada 1 dars bo'lsa ham 2 yil
 * ichida 100 dan ortiq dars sig'adi — real paketlar 12 darsdan oshmaydi.
 */
const MAX_LOOKAHEAD_DAYS = 730;

/**
 * Kelayotgan `count` ta dars sanasini qaytaradi (o'sish tartibida).
 * Jadval tugab qolsa (guruh `endDate` i yoki 2 yillik chegara) — topilganicha
 * qaytaradi, ya'ni ro'yxat `count` dan qisqa bo'lishi mumkin. Chaqiruvchi buni
 * "oxirini aniq ayta olmaymiz" deb o'qishi kerak, uzunlikni to'ldirib emas.
 */
export function projectLessonDates(input: ProjectionInput): string[] {
  const { afterDateStr, count, resolveScheduleDays, skipDates } = input;
  if (count <= 0) return [];

  const out: string[] = [];
  let cursor = addDaysToDateStr(afterDateStr, 1);

  for (
    let step = 0;
    step < MAX_LOOKAHEAD_DAYS && out.length < count;
    step += 1
  ) {
    if (input.lastPossibleDateStr && cursor > input.lastPossibleDateStr) break;

    const days = resolveScheduleDays(cursor);
    // `null` — jadval noma'lum bo'lgan davr. Bu yerda u faqat KELAJAK uchun
    // chaqiriladi, ya'ni amalda uchramaydi; uchrasa ham dars deb o'ylab
    // proyeksiya qilishdan ko'ra o'tkazib yuborgan ma'qul.
    if (
      days &&
      days.includes(dayOfWeekForDateStr(cursor)) &&
      !skipDates.has(cursor)
    ) {
      out.push(cursor);
    }
    cursor = addDaysToDateStr(cursor, 1);
  }

  return out;
}
