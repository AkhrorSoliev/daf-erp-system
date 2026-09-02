/**
 * Bir oyda guruhda nechta dars bo'lishi.
 *
 * Oylik to'lovda bu raqam narxni belgilaydi (oy narxi / dars soni), shuning
 * uchun u sof funksiya bo'lishi va vaqt mintaqasidan mustaqil sinalishi
 * kerak. Sanalar `Date` emas, `'YYYY-MM-DD'` satr sifatida kiradi va
 * chiqadi: baza Toshkent yarim tunini UTC da saqlaydi, `Date` bilan
 * solishtirish esa serverning mintaqasiga qarab bir kun siljib ketardi.
 */

/** `Group.exactDays` da saqlanadigan kun nomlari, JS getUTCDay tartibida. */
export const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export interface LessonDatesParams {
  year: number;
  /** 1–12. */
  month: number;
  /** `Group.exactDays` — registr va bo'shliqqa e'tibor berilmaydi. */
  exactDays: string[];
  /** Bayramlar va bekor qilingan darslar: 'YYYY-MM-DD'. */
  excludedDates?: string[];
  /** Shu kundan boshlab (o'rtada qo'shilgan o'quvchi). Kiritiladi. */
  fromDate?: string | null;
  /** Shu kungacha (o'rtada ketgan o'quvchi). Kiritiladi. */
  toDate?: string | null;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Oydagi dars kunlari, o'sish tartibida. */
export function lessonDatesInMonth(params: LessonDatesParams): string[] {
  const { year, month } = params;
  if (month < 1 || month > 12) return [];

  const wanted = new Set(
    params.exactDays.map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) return [];

  const excluded = new Set(params.excludedDates ?? []);
  const from = params.fromDate || null;
  const to = params.toDate || null;

  // 0-kun = keyingi oyning nol-kuni = shu oyning oxirgi kuni.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const out: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = iso(year, month, day);
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (excluded.has(date)) continue;

    const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
    if (wanted.has(weekday)) out.push(date);
  }
  return out;
}
