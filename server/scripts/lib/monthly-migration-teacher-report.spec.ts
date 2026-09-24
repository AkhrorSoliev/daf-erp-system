import type { RateVersion } from '../../src/salary/shared/deserved-math';
import {
  buildTeacherPayReport,
  createAccrualAmount,
  loadTeacherLessons,
  pickRate,
  renderTeacherCsv,
  type TeacherLessonInput,
} from './monthly-migration-teacher-report';

const v = (
  salaryType: string,
  value: number,
  from = '2026-06-01',
): RateVersion => ({
  salaryType,
  value,
  effectiveFrom: new Date(`${from}T00:00:00.000Z`),
  effectiveTo: null,
});

/** One (lesson, teacher) — credited already unless said otherwise. */
const lesson = (
  over: Partial<TeacherLessonInput> & { teacherId: number },
): TeacherLessonInput => ({
  teacherName: `T${over.teacherId}`,
  salaryType: 'PERCENTAGE',
  currentAccrual: 15_000,
  hasLiveAccrual: true,
  oldValue: 15_000,
  newAccrual: 13_846,
  ...over,
});

describe('createAccrualAmount (mirrors SalaryAccrualService.createAccrual)', () => {
  it('pays a percentage of the monthly per-lesson price', () => {
    expect(createAccrualAmount(v('PERCENTAGE', 40), 34_615, 13)).toBe(13_846);
  });
  it("splits a fixed-per-student rate over the month's lessons, not 12", () => {
    expect(
      createAccrualAmount(v('FIXED_PER_STUDENT', 150_000), 34_615, 13),
    ).toBe(11_538);
  });
  it('treats FIXED_MONTHLY like a per-student rate, as createAccrual does', () => {
    expect(createAccrualAmount(v('FIXED_MONTHLY', 200_000), 34_615, 13)).toBe(
      15_385,
    );
  });
  it('writes nothing without a rate', () => {
    expect(createAccrualAmount(null, 34_615, 13)).toBe(0);
  });
});

describe('pickRate', () => {
  const lessonDate = new Date('2026-09-09T00:00:00.000Z');
  it('prefers the group rate over the global one', () => {
    const rate = pickRate({
      groupVersions: [v('FIXED_PER_STUDENT', 150_000)],
      globalVersions: [v('PERCENTAGE', 40)],
      lessonDate,
    });
    expect(rate?.salaryType).toBe('FIXED_PER_STUDENT');
  });
  it('falls back to the global rate', () => {
    const rate = pickRate({
      groupVersions: [],
      globalVersions: [v('PERCENTAGE', 40)],
      lessonDate,
    });
    expect(rate?.salaryType).toBe('PERCENTAGE');
  });
});

describe('loadTeacherLessons', () => {
  const SEP_2 = new Date('2026-09-02T00:00:00.000Z');
  const SEP_4 = new Date('2026-09-04T00:00:00.000Z');
  const SEP_9 = new Date('2026-09-09T00:00:00.000Z');
  const PAIRS = [
    {
      groupId: 'grp-1',
      studentId: 10453,
      price: 450_000,
      plannedLessons: 13,
      lessonPaymentCount: 12,
    },
  ];

  function makeDb() {
    return {
      attendance: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'att-1', date: SEP_2, groupId: 'grp-1', studentId: 10453 },
          { id: 'att-2', date: SEP_4, groupId: 'grp-1', studentId: 10453 },
          // No accrual yet (a debtor's lesson): payroll would front it.
          { id: 'att-4', date: SEP_9, groupId: 'grp-1', studentId: 10453 },
          // Same group, a student the migration does not bill: ignored.
          { id: 'att-3', date: SEP_2, groupId: 'grp-1', studentId: 10999 },
        ]),
      },
      lessonTeacherOverride: {
        // A substitute took the 4 September lesson.
        findMany: jest
          .fn()
          .mockResolvedValue([
            { groupId: 'grp-1', date: SEP_4, teacherIds: [888] },
          ]),
      },
      groupTeacher: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ groupId: 'grp-1', teacherId: 777 }]),
      },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([
          { ...v('PERCENTAGE', 40), config: { userId: 777, groupId: null } },
          { ...v('PERCENTAGE', 50), config: { userId: 888, groupId: null } },
          {
            ...v('FIXED_PER_STUDENT', 150_000),
            config: { userId: 888, groupId: 'grp-1' },
          },
        ]),
      },
      salaryAccrual: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 777,
            groupId: 'grp-1',
            studentId: 10453,
            lessonDate: SEP_2,
            amount: 15_000,
          },
          {
            userId: 888,
            groupId: 'grp-1',
            studentId: 10453,
            lessonDate: SEP_4,
            amount: 12_500,
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 777, firstName: 'Ustoz', lastName: 'A' },
          { id: 888, firstName: 'Ustoz', lastName: 'B' },
        ]),
      },
    };
  }

  it("resolves each lesson's teacher and rate the way step 5 and createAccrual do", async () => {
    const lessons = await loadTeacherLessons(makeDb() as never, {
      companyId: 1001,
      periodKey: '2026-09',
      pairs: PAIRS,
    });
    // 450 000 / 13 = 34 615 per lesson: 40% -> 13 846; 150 000 / 13 -> 11 538.
    // The uncredited 09.09 lesson is worth 40% of the pack price today:
    // 450 000 / 12 = 37 500 -> 15 000.
    expect(lessons).toEqual([
      {
        teacherId: 777,
        teacherName: 'Ustoz A',
        salaryType: 'PERCENTAGE',
        currentAccrual: 15_000,
        hasLiveAccrual: true,
        oldValue: 15_000,
        newAccrual: 13_846,
      },
      {
        teacherId: 888,
        teacherName: 'Ustoz B',
        salaryType: 'FIXED_PER_STUDENT',
        currentAccrual: 12_500,
        hasLiveAccrual: true,
        oldValue: 12_500,
        newAccrual: 11_538,
      },
      {
        teacherId: 777,
        teacherName: 'Ustoz A',
        salaryType: 'PERCENTAGE',
        currentAccrual: 0,
        hasLiveAccrual: false,
        oldValue: 15_000,
        newAccrual: 13_846,
      },
    ]);
  });

  it('reads @db.Date columns by UTC-midnight bounds and only active company configs', async () => {
    const db = makeDb();
    await loadTeacherLessons(db as never, {
      companyId: 1001,
      periodKey: '2026-09',
      pairs: PAIRS,
    });

    const bounds = {
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lt: new Date('2026-10-01T00:00:00.000Z'),
    };
    expect(db.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: bounds }),
      }),
    );
    expect(db.employeeSalaryConfigVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          config: {
            userId: { in: [777, 888] },
            companyId: 1001,
            isActive: true,
          },
        },
      }),
    );
  });

  it('does not query for an empty list', async () => {
    const db = makeDb();
    expect(
      await loadTeacherLessons(db as never, {
        companyId: 1001,
        periodKey: '2026-09',
        pairs: [],
      }),
    ).toEqual([]);
    expect(db.attendance.findMany).not.toHaveBeenCalled();
  });
});

describe('buildTeacherPayReport', () => {
  it('sums each teacher and puts the largest cut first', () => {
    const report = buildTeacherPayReport([
      // 40% of 37 500 today -> 40% of 34 615 after
      lesson({ teacherId: 1 }),
      lesson({ teacherId: 1 }),
      // Never credited yet; payroll would front 150 000 / 12 = 12 500.
      lesson({
        teacherId: 2,
        salaryType: 'FIXED_PER_STUDENT',
        currentAccrual: 0,
        hasLiveAccrual: false,
        oldValue: 12_500,
        newAccrual: 11_538,
      }),
    ]);
    // "Before" is the old model's full pay, uncredited lessons included.
    expect(
      report.rows.map((r) => [
        r.teacherId,
        r.written,
        r.unwrittenLessons,
        r.before,
        r.after,
        r.delta,
      ]),
    ).toEqual([
      [1, 30_000, 0, 30_000, 27_692, -2_308],
      [2, 0, 1, 12_500, 11_538, -962],
    ]);
    expect(report.totals).toEqual({
      lessons: 3,
      unwrittenLessons: 1,
      written: 30_000,
      before: 42_500,
      after: 39_230,
      delta: -3_270,
    });
  });

  it('flags FIXED_MONTHLY lessons and lessons with no rate for review', () => {
    const report = buildTeacherPayReport([
      lesson({
        teacherId: 3,
        salaryType: 'FIXED_MONTHLY',
        currentAccrual: 16_667,
        oldValue: 16_667,
        newAccrual: 15_385,
      }),
      lesson({
        teacherId: 4,
        salaryType: null,
        currentAccrual: 0,
        hasLiveAccrual: false,
        oldValue: 0,
        newAccrual: 0,
      }),
      lesson({ teacherId: 5 }),
    ]);
    const flagged = report.rows
      .filter((r) => r.needsReview)
      .map((r) => r.teacherId)
      .sort();
    expect(flagged).toEqual([3, 4]);
    expect(report.rows.find((r) => r.teacherId === 4)?.salaryTypes).toEqual([
      'NO_RATE',
    ]);
  });

  it('renders one CSV line per teacher', () => {
    const csv = renderTeacherCsv(
      buildTeacherPayReport([lesson({ teacherId: 1, teacherName: 'A' })]),
    );
    expect(csv.split('\n')).toEqual([
      'teacherId,ism,turi,darslar,yozilmagan_darslar,yozilgan,eski_tizimda,yangi_tizimda,farq,tekshirish',
      '1,"A",PERCENTAGE,1,0,15000,15000,13846,-1154,',
    ]);
  });
});
