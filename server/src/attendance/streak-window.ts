import { tashkentDateStr } from '../common/date/tashkent';

/**
 * Sanoq oynasining boshi — bu sanadan OLDINGI davomat umuman sanalmaydi.
 *
 * NEGA KERAK: davomat `(studentId, groupId)` bo'yicha saqlanadi, yozuvga
 * (`Enrollment`) bog'lanmagan. Oynasiz ikkita xato chiqadi:
 *
 *  1. Cheksiz halqa. Admin pauzadagi o'quvchini faollashtiradi; u hali
 *     darsga kelmagan, oxirgi 3 qator hamon ABSENT — ertasi ertalab cron
 *     uni YANA pauza qiladi va admin bu halqadan chiqa olmaydi.
 *  2. Meros. Guruhdan chiqib, keyin o'sha guruhga qayta yozilgan o'quvchi
 *     eski ABSENT lari bilan keladi va birinchi kuniyoq pauzaga tushadi.
 *
 * `statusChangedAt` — cascade `FROZEN → ACTIVE` qaytarganda yozadigan
 * maydon, ya'ni FAOLLASHTIRISH SANOQNI NOLDAN BOSHLAYDI: o'quvchi yangi
 * imkoniyat (chegaracha dars) oladi.
 *
 * Sanalar MATN sifatida solishtiriladi — `YYYY-MM-DD` da leksikografik
 * tartib xronologik tartibga teng, va bu `@db.Date` (UTC yarim tuni) bilan
 * haqiqiy vaqt belgisini bitta `>` da aralashtirib yuborish xavfini yopadi.
 */
export function streakWindowStart(e: {
  startDate: Date | null;
  createdAt: Date;
  statusChangedAt: Date | null;
}): string {
  const dates = [tashkentDateStr(e.startDate ?? e.createdAt)];
  if (e.statusChangedAt) dates.push(tashkentDateStr(e.statusChangedAt));
  return dates.reduce((a, b) => (a > b ? a : b));
}
