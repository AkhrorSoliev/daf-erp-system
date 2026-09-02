import { AttendanceStatus } from '@prisma/client';
import {
  AbsenceStreakService,
  consecutiveAbsentCount,
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
      enrollment: { findMany: jest.fn().mockResolvedValue(enrollments) },
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
