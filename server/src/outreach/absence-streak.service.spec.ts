import { AttendanceStatus } from '@prisma/client';
import {
  AbsenceStreakService,
  consecutiveAbsentCount,
  streakWindowStart,
} from './absence-streak.service';

const A = AttendanceStatus.ABSENT;
const P = AttendanceStatus.PRESENT;
const L = AttendanceStatus.LATE;
const E = AttendanceStatus.EXCUSED;

describe('consecutiveAbsentCount', () => {
  it('eng yangisidan boshlab ketma-ket ABSENT larni sanaydi', () => {
    expect(
      consecutiveAbsentCount([{ status: A }, { status: A }, { status: A }]),
    ).toBe(3);
  });

  it('PRESENT ketma-ketlikni uzadi', () => {
    expect(
      consecutiveAbsentCount([{ status: A }, { status: P }, { status: A }]),
    ).toBe(1);
  });

  it('LATE ham uzadi — dars qoldirilmagan', () => {
    expect(consecutiveAbsentCount([{ status: A }, { status: L }])).toBe(1);
  });

  it('EXCUSED ham uzadi — sababli qoldirish hisobga olinmaydi', () => {
    expect(
      consecutiveAbsentCount([{ status: A }, { status: E }, { status: A }]),
    ).toBe(1);
  });

  it("bo'sh ro'yxatda nol", () => {
    expect(consecutiveAbsentCount([])).toBe(0);
  });

  it("eng yangisi ABSENT bo'lmasa nol", () => {
    expect(
      consecutiveAbsentCount([{ status: P }, { status: A }, { status: A }]),
    ).toBe(0);
  });
});

/**
 * Bitta so'rovga o'tishda eng katta xavf — N+1 dan qutulish emas, balki
 * XOM SQL yo'lidagi sana. `Attendance.date` bu `@db.Date`; Prisma uni UTC
 * yarim tuni qilib beradi, node-postgres esa MAHALLIY yarim tun qilib berardi.
 * Shuning uchun servis sanani matn ko'rinishida o'qib, o'zi UTC ga o'giradi —
 * quyidagi testlar aynan shu o'girishni va guruhlashni tekshiradi.
 */
describe("AbsenceStreakService.computeStreaks — bitta so'rovli yo'l", () => {
  const companyId = 1001;

  function makeService(
    enrollments: { id: string; studentId: number; groupId: string }[],
    rawRows: {
      studentId: number;
      groupId: string;
      dateStr: string;
      status: AttendanceStatus;
    }[],
    earlierPresent: { date: Date } | null = null,
  ) {
    const queryRaw = jest.fn().mockResolvedValue(rawRows);
    const prisma = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue(
          // Sanoq oynasi maydonlari — testlar ularni ataylab ko'rsatmaydi,
          // chunki bu yerdagi mavzu oyna emas, juftlikka ajratish.
          enrollments.map((e) => ({
            startDate: null,
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            statusChangedAt: null,
            ...e,
          })),
        ),
      },
      attendance: { findFirst: jest.fn().mockResolvedValue(earlierPresent) },
      $queryRaw: queryRaw,
    };
    return {
      service: new AbsenceStreakService(prisma as never),
      prisma,
      queryRaw,
    };
  }

  it("yozuvlar soni qancha bo'lsa ham davomat uchun BITTA so'rov ketadi", async () => {
    const enrollments = Array.from({ length: 250 }, (_, i) => ({
      id: `e${i}`,
      studentId: 10000 + i,
      groupId: `g${i}`,
    }));
    const { service, queryRaw } = makeService(enrollments, []);

    await service.computeStreaks({ companyId, threshold: 3 });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("sanani UTC yarim tuniga o'giradi — mahalliy mintaqaga siljitmaydi", async () => {
    const { service } = makeService(
      [{ id: 'e1', studentId: 10001, groupId: 'g1' }],
      [
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-28', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-26', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-24', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-22', status: P },
      ],
    );

    const rows = await service.computeStreaks({ companyId, threshold: 3 });

    expect(rows).toHaveLength(1);
    expect(rows[0].lastAbsenceDate.toISOString()).toBe(
      '2026-08-28T00:00:00.000Z',
    );
    expect(rows[0].lastPresentDate!.toISOString()).toBe(
      '2026-08-22T00:00:00.000Z',
    );
  });

  it("qatorlarni to'g'ri juftlikka ajratadi — bir o'quvchi ikki guruhda", async () => {
    const { service } = makeService(
      [
        { id: 'e1', studentId: 10001, groupId: 'g1' },
        { id: 'e2', studentId: 10001, groupId: 'g2' },
      ],
      [
        // g1: uchta ketma-ket kelmagan → navbatga tushadi
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-28', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-26', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-24', status: A },
        // g2: oxirgisi kelgan → tushmaydi
        { studentId: 10001, groupId: 'g2', dateStr: '2026-08-27', status: P },
        { studentId: 10001, groupId: 'g2', dateStr: '2026-08-25', status: A },
        { studentId: 10001, groupId: 'g2', dateStr: '2026-08-23', status: A },
      ],
    );

    const rows = await service.computeStreaks({ companyId, threshold: 3 });

    expect(rows.map((r) => r.groupId)).toEqual(['g1']);
    expect(rows[0].consecutiveAbsentCount).toBe(3);
  });

  it("bitta ham davomati yo'q yozuv navbatga tushmaydi", async () => {
    const { service } = makeService(
      [{ id: 'e1', studentId: 10001, groupId: 'g1' }],
      [],
    );

    await expect(
      service.computeStreaks({ companyId, threshold: 3 }),
    ).resolves.toEqual([]);
  });

  it("oxirgi 10 tada kelgan kun bo'lmasa zaxira so'rovga tushadi", async () => {
    const { service, prisma } = makeService(
      [{ id: 'e1', studentId: 10001, groupId: 'g1' }],
      [
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-28', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-26', status: A },
        { studentId: 10001, groupId: 'g1', dateStr: '2026-08-24', status: A },
      ],
      { date: new Date('2026-05-01T00:00:00.000Z') },
    );

    const rows = await service.computeStreaks({ companyId, threshold: 3 });

    expect(prisma.attendance.findFirst).toHaveBeenCalledTimes(1);
    expect(rows[0].lastPresentDate!.toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    );
  });

  it("yozuv bo'lmasa bazaga umuman murojaat qilinmaydi", async () => {
    const { service, queryRaw } = makeService([], []);

    await expect(
      service.computeStreaks({ companyId, threshold: 3 }),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('streakWindowStart', () => {
  it("startDate bo'lsa o'shani oladi", () => {
    expect(
      streakWindowStart({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-09-01');
  });

  it("startDate yo'q bo'lsa createdAt ga tushadi", () => {
    expect(
      streakWindowStart({
        startDate: null,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-08-20');
  });

  it("faollashtirilgan kun kechroq — oyna o'shandan boshlanadi", () => {
    expect(
      streakWindowStart({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        statusChangedAt: new Date('2026-09-15T06:00:00.000Z'),
      }),
    ).toBe('2026-09-15');
  });

  it("muzlatilgan kun oynadan oldin bo'lsa startDate g'olib", () => {
    // FROZEN ga o'tish ham statusChangedAt ni yozadi — lekin u yozuv
    // boshlanishidan oldin bo'lishi mumkin emas, shuning uchun eng
    // kechigi olinadi.
    expect(
      streakWindowStart({
        startDate: new Date('2026-09-20T00:00:00.000Z'),
        createdAt: new Date('2026-09-20T00:00:00.000Z'),
        statusChangedAt: new Date('2026-09-10T06:00:00.000Z'),
      }),
    ).toBe('2026-09-20');
  });

  it("Toshkent kuni bo'yicha: UTC 20:00 — ertangi kun", () => {
    // 2026-09-15T20:00Z = Toshkentda 16-sentabr 01:00
    expect(
      streakWindowStart({
        startDate: null,
        createdAt: new Date('2026-09-15T20:00:00.000Z'),
        statusChangedAt: null,
      }),
    ).toBe('2026-09-16');
  });
});

/**
 * Sanoq oynasi — pauza avtomatikasining eng nozik qismi. Oynasiz cron
 * faollashtirilgan o'quvchini ertasi kuni YANA pauza qilardi (u hali darsga
 * ulgurmagan, oxirgi qatorlar hamon ABSENT), va admin bu halqadan hech
 * qachon chiqa olmasdi.
 */
describe("AbsenceStreakService — sanoq oynasi so'rovga uzatiladi", () => {
  const companyId = 1001;

  function makeService(
    enrollments: {
      id: string;
      studentId: number;
      groupId: string;
      startDate: Date | null;
      createdAt: Date;
      statusChangedAt: Date | null;
    }[],
    rawRows: {
      studentId: number;
      groupId: string;
      dateStr: string;
      status: AttendanceStatus;
    }[],
  ) {
    const queryRaw = jest.fn().mockResolvedValue(rawRows);
    const prisma = {
      enrollment: { findMany: jest.fn().mockResolvedValue(enrollments) },
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: queryRaw,
    };
    return {
      service: new AbsenceStreakService(prisma as never),
      prisma,
      queryRaw,
    };
  }

  const reactivated = {
    id: 'e1',
    studentId: 10001,
    groupId: 'g1',
    startDate: null,
    createdAt: new Date('2026-09-01T06:00:00.000Z'),
    statusChangedAt: new Date('2026-09-10T06:00:00.000Z'),
  };

  it('xom SQL ga har yozuvning oyna sanasi uzatiladi', async () => {
    const { service, queryRaw } = makeService([reactivated], []);
    await service.computeStreaks({ companyId });

    // Tagged template: [strings, ...values]. Oyna sanalari — alohida massiv.
    const values = queryRaw.mock.calls[0].slice(1);
    expect(values).toContainEqual(['2026-09-10']);
  });

  it("oynadan keyingi bitta ABSENT — streak 1, eskisi qo'shilmaydi", async () => {
    const { service } = makeService(
      [reactivated],
      [
        {
          studentId: 10001,
          groupId: 'g1',
          dateStr: '2026-09-12',
          status: AttendanceStatus.ABSENT,
        },
      ],
    );
    const rows = await service.computeStreaks({ companyId, threshold: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].consecutiveAbsentCount).toBe(1);
  });

  it('chegaradan past streak qaytarilmaydi', async () => {
    const { service } = makeService(
      [reactivated],
      [
        {
          studentId: 10001,
          groupId: 'g1',
          dateStr: '2026-09-12',
          status: AttendanceStatus.ABSENT,
        },
      ],
    );
    const rows = await service.computeStreaks({ companyId, threshold: 2 });
    expect(rows).toHaveLength(0);
  });

  it('oxirgi kelgan kunni izlash ham oyna bilan chegaralanadi', async () => {
    const { service, prisma } = makeService(
      [reactivated],
      [
        {
          studentId: 10001,
          groupId: 'g1',
          dateStr: '2026-09-12',
          status: AttendanceStatus.ABSENT,
        },
      ],
    );
    await service.computeStreaks({ companyId, threshold: 1 });

    // Oynasiz bu so'rov boshqa davrdagi darsni "oxirgi kelgan" deb
    // ko'rsatardi — admin kartadagi sanaga ishonmay qolardi.
    expect(prisma.attendance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cancellationId: null,
          date: { gte: new Date('2026-09-10T00:00:00.000Z') },
        }),
      }),
    );
  });
});

/**
 * Xom SQL ning o'zi mock qilinadi, shuning uchun bu testlar so'rov MATNINI
 * tekshiradi. Uchala qoida `rn <= 10` oynasidan OLDIN turishi shart: aks
 * holda bekor qilingan dars o'nlikdan joy egallab, haqiqiy davomatni
 * ko'rinmas qilib qo'yardi.
 */
describe("AbsenceStreakService — so'rovdagi uchta qoida", () => {
  const companyId = 1001;

  async function capturedSql(): Promise<string> {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            studentId: 10001,
            groupId: 'g1',
            startDate: null,
            createdAt: new Date('2026-09-01T06:00:00.000Z'),
            statusChangedAt: null,
          },
        ]),
      },
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: queryRaw,
    };
    const service = new AbsenceStreakService(prisma as never);
    await service.computeStreaks({ companyId });
    return (queryRaw.mock.calls[0][0] as string[]).join('?');
  }

  it('bekor qilingan darsni chiqarib tashlaydi', async () => {
    expect(await capturedSql()).toContain('"cancellationId" IS NULL');
  });

  it('oldindan aytilgan SABABSIZ qoldirishni ABSENT deb sanaydi', async () => {
    const sql = await capturedSql();
    expect(sql).toContain('PlannedAbsence');
    expect(sql).toContain("'SABABSIZ'");
  });

  it('sanoq oynasidan oldingi davomatni olmaydi', async () => {
    expect(await capturedSql()).toContain('a."date" >= w."since"');
  });

  it("uchala filtr ham rn oynasidan OLDIN — ichki so'rovda", async () => {
    const sql = await capturedSql();
    const innerEnd = sql.indexOf(') t');
    expect(innerEnd).toBeGreaterThan(-1);
    const inner = sql.slice(0, innerEnd);
    expect(inner).toContain('"cancellationId" IS NULL');
    expect(inner).toContain('a."date" >= w."since"');
    expect(inner).toContain('PlannedAbsence');
  });
});
