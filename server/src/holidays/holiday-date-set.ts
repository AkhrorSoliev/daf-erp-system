import { HolidayStatus, type PrismaClient } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
} from '../attendance/shared/date-utils';
import { tashkentDayStartUtc } from '../common/date/tashkent';

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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ACTIVE holidays overlapping `[rangeStart, rangeEnd]`. The bounds are padded
 * by ±1 day to absorb the UTC vs Tashkent midnight skew.
 */
function activeHolidaysIn(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
  branchId?: number | null,
) {
  return db.holiday.findMany({
    where: {
      status: HolidayStatus.ACTIVE,
      deletedAt: null,
      date: { lte: new Date(rangeEnd.getTime() + DAY_MS) },
      endDate: { gte: new Date(rangeStart.getTime() - DAY_MS) },
      ...holidayBranchWhere(branchId),
    },
    select: { date: true, endDate: true, branchId: true },
  });
}

/** Adds the Tashkent days of `h` that fall inside `[fromStr, toStr]` to `set`. */
function addHolidayDays(
  set: Set<string>,
  h: { date: Date; endDate: Date },
  fromStr: string,
  toStr: string,
): void {
  let cursor = tashkentDateStr(h.date);
  const end = tashkentDateStr(h.endDate);
  while (cursor <= end) {
    if (cursor >= fromStr && cursor <= toStr) set.add(cursor);
    cursor = addDaysToDateStr(cursor, 1);
  }
}

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
  const holidays = await activeHolidaysIn(db, rangeStart, rangeEnd, branchId);
  const fromStr = tashkentDateStr(rangeStart);
  const toStr = tashkentDateStr(rangeEnd);
  const set = new Set<string>();
  for (const h of holidays) addHolidayDays(set, h, fromStr, toStr);
  return set;
}

/** A branch's holiday days: the company-wide ones plus the branch's own. */
export type BranchHolidayDates = (branchId: number) => Set<string>;

/**
 * Every branch's holiday days in ONE read, for a report that walks groups of
 * several branches at once (the month-end expectation, the activity report).
 * One set for all of them would let a branch's own holiday close every branch
 * (CEO decision 10.10.2026: it closes that branch alone).
 */
export async function buildHolidayDateSetsByBranch(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BranchHolidayDates> {
  const holidays = await activeHolidaysIn(db, rangeStart, rangeEnd);
  const fromStr = tashkentDateStr(rangeStart);
  const toStr = tashkentDateStr(rangeEnd);
  const companyWide = new Set<string>();
  const own = new Map<number, Set<string>>();
  for (const h of holidays) {
    let set = companyWide;
    if (h.branchId != null) {
      set = own.get(h.branchId) ?? new Set<string>();
      own.set(h.branchId, set);
    }
    addHolidayDays(set, h, fromStr, toStr);
  }
  // Merged once per branch: the activity report asks per group per day.
  const merged = new Map<number, Set<string>>();
  return (branchId) => {
    let set = merged.get(branchId);
    if (!set) {
      set = new Set([...companyWide, ...(own.get(branchId) ?? [])]);
      merged.set(branchId, set);
    }
    return set;
  };
}

/**
 * How far ahead a bank-day term reads holidays. Ten bank days cross at most
 * one 60-day holiday (the cap on a holiday's length) plus weekends.
 */
export const TERM_HOLIDAY_HORIZON_DAYS = 120;

/**
 * The holidays a bank-day term starting on `fromDateStr` can cross: the
 * branch's own and the company-wide ones (ADR-0077). `branchId` null reads
 * every branch's — only a branch-less card gets there, and money paths refuse
 * those before.
 */
export function termHolidays(
  db: HolidayDateSetDb,
  fromDateStr: string,
  branchId: number | null,
): Promise<Set<string>> {
  return buildHolidayDateSet(
    db,
    tashkentDayStartUtc(fromDateStr),
    tashkentDayStartUtc(
      addDaysToDateStr(fromDateStr, TERM_HOLIDAY_HORIZON_DAYS),
    ),
    branchId,
  );
}
