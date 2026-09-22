import { MonthlyChargeService } from './monthly-charge.service';
import { lessonDatesInMonth } from './planned-lessons';
import { AttendanceReadService } from '../attendance/attendance-read.service';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';

/**
 * REJA == DAVOMAT.
 *
 * `plannedLessons` ikki narsani belgilaydi: bir darsning muzlatilgan narxi
 * (oy narxi / reja) va FIXED_PER_STUDENT o'qituvchi haqining bo'luvchisi.
 * Reja oyda ROSTDAN o'tiladigan darslar sonidan bitta farq qilsa, ustoz
 * oyning 12/13 yoki 14/13 ulushini oladi — CEO 1-javobi aynan shuni
 * taqiqlaydi.
 *
 * Shuning uchun bu yerda ikkala tomon BITTA fikstura to'plamidan quriladi:
 * `MonthlyChargeService.resolveMonthPlanDates` + `lessonDatesInMonth` va
 * `AttendanceReadService.getLessonDates`. Testlar sonni emas, KUNLAR
 * RO'YXATINI solishtiradi — reja davomatning ko'zgusi bo'lishi kerak.
 *
 * Soxta Prisma `where` shartlarini ROSTDAN qo'llaydi: aks holda ikkala
 * servis ham hamma qatorni olib, so'rov oynasi noto'g'ri bo'lsa ham test
 * yashil qolardi (1-holat aynan shunday yashirinib yotgan edi).
 */

const GROUP_ID = 'grp-1';
const BRANCH_ID = 1;
const YEAR = 2026;
const MONTH = 9;
// Seshanba/payshanba/shanba — sentabr 2026 da 13 ta dars kuni:
// 1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26, 29.
const EXACT_DAYS = ['tuesday', 'thursday', 'saturday'];

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Fixture {
  /** `{ date, endDate }` — ko'p kunlik bayram ham beriladi. */
  holidays?: { date: string; endDate?: string }[];
  reschedules?: { originalDate: string; newDate: string }[];
  cancellations?: string[];
  /**
   * Guruhning faol oynasi. Berilmasa butun yil — ya'ni oyni qismaydi.
   * `AttendanceReadService.getLessonDates` oyni shu oynaga qisadi, shuning
   * uchun oyna oy o'rtasiga tushganda ikkala tomon ham shuni bilishi kerak.
   */
  groupStart?: string;
  groupEnd?: string;
}

type WhereValue = unknown;

function matchesCondition(value: unknown, cond: WhereValue): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return (value as Date).getTime() === cond.getTime();
  if (typeof cond === 'object' && cond !== null) {
    const c = cond as Record<string, Date>;
    const v = value as Date;
    if (c.gte && v.getTime() < c.gte.getTime()) return false;
    if (c.gt && v.getTime() <= c.gt.getTime()) return false;
    if (c.lte && v.getTime() > c.lte.getTime()) return false;
    if (c.lt && v.getTime() >= c.lt.getTime()) return false;
    return true;
  }
  return value === cond;
}

function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const branches = cond as Record<string, unknown>[];
      if (!branches.some((b) => matchesWhere(row, b))) return false;
      continue;
    }
    if (key === 'AND') {
      const branches = cond as Record<string, unknown>[];
      if (!branches.every((b) => matchesWhere(row, b))) return false;
      continue;
    }
    if (!(key in row)) continue;
    if (!matchesCondition(row[key], cond)) return false;
  }
  return true;
}

function buildFakePrisma(fx: Fixture) {
  const groupStart = d(fx.groupStart ?? '2026-01-01');
  const groupEnd = d(fx.groupEnd ?? '2026-12-31');
  const holidayRows = (fx.holidays ?? []).map((h) => ({
    date: d(h.date),
    endDate: d(h.endDate ?? h.date),
    status: 'ACTIVE',
    deletedAt: null,
    branchId: null,
  }));
  const rescheduleRows = (fx.reschedules ?? []).map((r) => ({
    groupId: GROUP_ID,
    deletedAt: null,
    originalDate: d(r.originalDate),
    newDate: d(r.newDate),
  }));
  const cancellationRows = (fx.cancellations ?? []).map((c) => ({
    groupId: GROUP_ID,
    deletedAt: null,
    date: d(c),
    reason: 'test',
  }));

  const find =
    (rows: Record<string, unknown>[]) =>
    (args: { where?: Record<string, unknown> }) =>
      Promise.resolve(rows.filter((row) => matchesWhere(row, args?.where)));

  return {
    holiday: { findMany: jest.fn(find(holidayRows)) },
    lessonReschedule: { findMany: jest.fn(find(rescheduleRows)) },
    lessonCancellation: { findMany: jest.fn(find(cancellationRows)) },
    // Davomat qatorlari YO'Q: bu yerda ikkala tomonning REJASI
    // solishtiriladi, yozilgan davomat asos ro'yxatni kengaytirmasin.
    attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    group: {
      findFirst: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        name: 'Standart-A',
        exactDays: EXACT_DAYS,
        startDate: groupStart,
        endDate: groupEnd,
        scheduleSnapshots: [],
        _count: { enrollments: 18 },
      }),
      // Reja tomoni guruhning faol oynasini SHU so'rov bilan oladi —
      // davomat tomoni bilan bir xil sanalardan.
      findUnique: jest.fn().mockResolvedValue({
        startDate: groupStart,
        endDate: groupEnd,
      }),
    },
  };
}

/** Reja: muzlatilgan `plannedLessons` aynan shu ro'yxatdan chiqadi. */
async function planDays(fx: Fixture): Promise<string[]> {
  const prisma = buildFakePrisma(fx);
  const service = new MonthlyChargeService(
    prisma as never,
    undefined as never,
    undefined as never,
  );
  const plan = await service.resolveMonthPlanDates(
    prisma as never,
    GROUP_ID,
    BRANCH_ID,
    YEAR,
    MONTH,
  );
  return lessonDatesInMonth({
    year: YEAR,
    month: MONTH,
    exactDays: EXACT_DAYS,
    excludedDates: plan.excludedDates,
    addedDates: plan.addedDates,
  });
}

/** Davomat kalendari: o'qituvchiga haq aynan shu kunlar uchun yoziladi. */
async function attendanceDays(fx: Fixture): Promise<string[]> {
  const prisma = buildFakePrisma(fx);
  const holidays = {
    buildHolidayDateSet: (start: Date, end: Date) =>
      buildHolidayDateSet(prisma as never, start, end),
  };
  const read = new AttendanceReadService(prisma as never, holidays as never);
  const rows = await read.getLessonDates(GROUP_ID, MONTH, YEAR, 1);
  return rows.map((r) => r.date);
}

async function bothSides(fx: Fixture) {
  const [plan, attendance] = await Promise.all([
    planDays(fx),
    attendanceDays(fx),
  ]);
  return { plan, attendance };
}

describe('oylik reja davomat kalendariga TENG', () => {
  it("o'zgarishsiz oy: 13 ta dars kuni, ikkala tomonda bir xil", async () => {
    const { plan, attendance } = await bothSides({});
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(13);
  });

  it('KEYINGI OYGA surilgan dars rejadan ham chiqadi', async () => {
    // 29-sentabr (seshanba) darsi 1-oktabrga ko'chdi. Ilgari so'rov
    // `newDate` ni shu oy bilan cheklagani uchun qator umuman qaytmasdi:
    // reja 13 da qolib, davomatda 12 ta dars bo'lardi.
    const fx: Fixture = {
      reschedules: [{ originalDate: '2026-09-29', newDate: '2026-10-01' }],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(12);
    expect(plan).not.toContain('2026-09-29');
  });

  it('JADVALDAGI kunga surilgan dars oyga yangi kun qo`shmaydi', async () => {
    // 29-sentabr darsi 26-sentabrga (shanba — guruhning o'z kuni) ko'chdi.
    // Ilgari bayram bo'lmagani uchun halqa bu qatorni tashlab ketardi.
    const fx: Fixture = {
      reschedules: [{ originalDate: '2026-09-29', newDate: '2026-09-26' }],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(12);
    expect(plan.filter((x) => x === '2026-09-26')).toHaveLength(1);
  });

  it('BOSHQA OYDAN ko`chirib kelingan dars rejaga qo`shiladi', async () => {
    // 29-avgust darsi 2-sentabrga (chorshanba — jadvalda yo'q kun) ko'chdi.
    // Ilgari so'rov `originalDate` ni shu oy bilan cheklagani uchun qator
    // qaytmasdi: reja 13 da qolib, davomatda 14 ta dars bo'lardi.
    const fx: Fixture = {
      reschedules: [{ originalDate: '2026-08-29', newDate: '2026-09-02' }],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(14);
    expect(plan).toContain('2026-09-02');
  });

  it('BEKOR QILINGAN bayram qoplamasi bayramni rejaga QAYTARMAYDI', async () => {
    // 1-sentabr bayrami 16-sentabrga ko'chirilgan, keyin 16-sentabr bekor
    // qilingan. Ikkala kunda ham dars yo'q — reja 12 bo'lishi shart.
    // Ilgari `holidayMakeups.delete(day)` ASL kun kaliti bo'yicha
    // izlaganda bekor qilish YANGI kunni olib kelardi, mos kelmasdi va
    // bayram rejada qolib ketardi (1-topilma).
    const fx: Fixture = {
      holidays: [{ date: '2026-09-01' }],
      reschedules: [{ originalDate: '2026-09-01', newDate: '2026-09-16' }],
      cancellations: ['2026-09-16'],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(12);
    expect(plan).not.toContain('2026-09-01');
    expect(plan).not.toContain('2026-09-16');
  });

  it('bayram shu oy ichida qoplansa sanoq o`zgarmaydi', async () => {
    const fx: Fixture = {
      holidays: [{ date: '2026-09-01' }],
      reschedules: [{ originalDate: '2026-09-01', newDate: '2026-09-16' }],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    expect(plan).toHaveLength(13);
    expect(plan).toContain('2026-09-16');
    expect(plan).not.toContain('2026-09-01');
  });

  it('bir nechta o`zgarish birga tushganda ham teng qoladi', async () => {
    const fx: Fixture = {
      holidays: [{ date: '2026-09-03' }],
      reschedules: [
        // bayram qoplamasi — jadvalda yo'q kunga
        { originalDate: '2026-09-03', newDate: '2026-09-04' },
        // keyingi oyga surildi
        { originalDate: '2026-09-29', newDate: '2026-10-02' },
        // boshqa oydan ko'chirib kelindi
        { originalDate: '2026-08-31', newDate: '2026-09-09' },
        // jadvaldagi kunga surildi
        { originalDate: '2026-09-24', newDate: '2026-09-26' },
      ],
      cancellations: ['2026-09-12'],
    };
    const { plan, attendance } = await bothSides(fx);
    expect(plan).toEqual(attendance);
    // 13 - 03(bayram) + 04 - 29 + 09 - 24 - 12(bekor) = 11
    expect(plan).toHaveLength(11);
  });
});

/**
 * Guruhning faol oynasi (`startDate`/`endDate`) oy o'rtasiga tushsa,
 * reja bilan davomat ATAYLAB teng bo'lmaydi — yuqoridagi tenglik shu
 * yerda qo'llanmaydi.
 *
 * Sabab pul hisobida. `plannedLessons` — oy narxi bo'linadigan son, va u
 * BARCHA guruhlarda oyning to'liq dars kunlari bo'lishi kerak. Agar u
 * guruh oynasiga qisilsa, 15-sentabrda boshlangan guruhning bitta darsi
 * 450 000 / 7 = 64 286 so'mga chiqib ketardi va o'quvchi guruhi kech
 * boshlangani uchun bir darsga ikki baravar to'lardi. Qisilmagan holda
 * dars narxi 450 000 / 13 = 34 615 bo'lib qoladi, o'quvchidan esa
 * `coveredDates` (u `enrollment.startDate` bilan qisiladi) orqali
 * 450 000 x 7/13 olinadi — ya'ni proporsional. Ustoz ham o'sha ulushni
 * oladi.
 *
 * Qisiladigan YAGONA narsa — KO'CHIRIB kelingan kun: oyna tashqarisiga
 * ko'chirilgan darsda davomat hech qachon o'tmaydi, demak u rejani
 * oshirib, dars narxini pasaytirib yuborardi.
 */
describe('guruhning faol oynasi', () => {
  it('oyna tashqarisiga ko`chirilgan dars rejaga QO`SHILMAYDI', async () => {
    // Guruh 20-sentabrda tugaydi; 29-avgust darsi 25-sentabrga ko'chirilgan.
    const fx: Fixture = {
      groupEnd: '2026-09-20',
      reschedules: [{ originalDate: '2026-08-29', newDate: '2026-09-25' }],
    };
    const plan = await planDays(fx);
    expect(plan).not.toContain('2026-09-25');
    // Asos ro'yxat qisilmaydi: sentabrning o'z 13 ta dars kuni qoladi.
    expect(plan).toHaveLength(13);
  });

  it('guruh boshlanishidan OLDINGI kunga ko`chirilgan dars ham qo`shilmaydi', async () => {
    // Guruh 15-sentabrda boshlanadi; 17-sentabr darsi 9-sentabrga ko'chdi.
    const fx: Fixture = {
      groupStart: '2026-09-15',
      reschedules: [{ originalDate: '2026-09-17', newDate: '2026-09-09' }],
    };
    const plan = await planDays(fx);
    expect(plan).not.toContain('2026-09-09');
    // 17-sentabr ko'chirilgani uchun rejadan chiqadi, 9-sentabr esa
    // oyna tashqarisida bo'lgani uchun qo'shilmaydi: 13 - 1 = 12.
    expect(plan).not.toContain('2026-09-17');
    expect(plan).toHaveLength(12);
  });

  it('oyna ICHIDAGI kunga ko`chirilgan dars odatdagidek qo`shiladi', async () => {
    // Qorovul faqat oyna tashqarisini to'sadi — ichkarisiga tegmaydi.
    const fx: Fixture = {
      groupStart: '2026-09-01',
      groupEnd: '2026-09-30',
      reschedules: [{ originalDate: '2026-09-17', newDate: '2026-09-18' }],
    };
    const plan = await planDays(fx);
    expect(plan).toContain('2026-09-18');
    expect(plan).not.toContain('2026-09-17');
    expect(plan).toHaveLength(13);
  });
});
