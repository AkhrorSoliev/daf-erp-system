import { HolidayStatus, type PrismaClient } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
} from '../attendance/shared/date-utils';

/**
 * "Bu oraliqda qaysi kunlar bayram?" — `HolidaysService` dan AJRATILGAN
 * implementatsiya.
 *
 * Nega alohida fayl. `HolidaysService` `GroupHolidayCascadeService` va
 * `common/status` barrelini tortadi; `common/status` esa
 * `status-cascade → billing → transactions` zanjiri orqali qaytib keladi.
 * Ya'ni `HolidaysService` ni transactions tomonidan import qilish ES-modul
 * halqasini yopadi va barrel yarim yuklangan holatda qoladi: `GroupsModule`
 * `StatusCascadeService` ni `undefined` deb ko'radi va Nest DI yiqiladi
 * ("argument at index [2]"). Halqani kesishning eng arzon joyi shu —
 * mantiq bu yerda yashaydi, `HolidaysService` unga DELEGAT qiladi, demak
 * nusxa emas, bitta manba.
 *
 * `HolidayDateSetDb` faqat `holiday` delegatini talab qiladi, shuning uchun
 * uni `PrismaService` ham, tranzaksiya mijozi ham qondiradi.
 */
export type HolidayDateSetDb = Pick<PrismaClient, 'holiday'>;

/** `branchId` berilmasa — barcha filiallar; berilsa, global + o'sha filial. */
export const holidayBranchWhere = (branchId?: number | null) =>
  branchId === undefined || branchId === null
    ? {}
    : { OR: [{ branchId: null }, { branchId }] };

/**
 * `[rangeStart, rangeEnd]` ichidagi bayram kunlari (Toshkent kalendari,
 * `YYYY-MM-DD`). So'rov chegaralari ±1 kunga kengaytiriladi — UTC va Toshkent
 * yarim tunlari orasidagi siljishni yutish uchun.
 */
export async function buildHolidayDateSet(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
  branchId?: number | null,
): Promise<Set<string>> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const holidays = await db.holiday.findMany({
    where: {
      status: HolidayStatus.ACTIVE,
      deletedAt: null,
      date: { lte: new Date(rangeEnd.getTime() + DAY_MS) },
      endDate: { gte: new Date(rangeStart.getTime() - DAY_MS) },
      ...holidayBranchWhere(branchId),
    },
    select: { date: true, endDate: true },
  });

  const rangeStartStr = tashkentDateStr(rangeStart);
  const rangeEndStr = tashkentDateStr(rangeEnd);

  const set = new Set<string>();
  for (const h of holidays) {
    let cursor = tashkentDateStr(h.date);
    const end = tashkentDateStr(h.endDate);
    while (cursor <= end) {
      if (cursor >= rangeStartStr && cursor <= rangeEndStr) set.add(cursor);
      cursor = addDaysToDateStr(cursor, 1);
    }
  }
  return set;
}
