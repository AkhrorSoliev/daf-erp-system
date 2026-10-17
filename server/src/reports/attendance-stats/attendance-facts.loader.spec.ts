import { AttendanceFactsLoader } from './attendance-facts.loader';

const d = (s: string) => new Date(s);
const SEPT = { from: '2026-09-01', to: '2026-10-01' };

function prismaMock() {
  return {
    attendance: {
      findMany: jest.fn().mockResolvedValue([
        {
          groupId: 'g1',
          studentId: 1,
          date: d('2026-09-07T00:00:00.000Z'),
          status: 'PRESENT',
          cancellationId: null,
        },
        {
          groupId: 'g1',
          studentId: 2,
          date: d('2026-09-07T00:00:00.000Z'),
          status: 'EXCUSED',
          cancellationId: 'c9',
        },
      ]),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1',
          name: 'A1-04',
          branchId: 1,
          deletedAt: d('2026-10-01T05:00:00.000Z'),
          courseId: 'c1',
          course: { name: 'Standart', paymentModel: 'MONTHLY' },
          teachers: [
            { teacher: { id: 9, firstName: 'Zafar', lastName: 'Aliyev' } },
            { teacher: { id: 7, firstName: 'Otabek', lastName: 'Sobirov' } },
          ],
        },
      ]),
    },
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue([
        {
          studentId: 1,
          groupId: 'g1',
          periodYear: 2026,
          periodMonth: 9,
          perLessonCost: 34_615,
          discountPercent: 10,
        },
        {
          studentId: 2,
          groupId: 'g1',
          periodYear: 2026,
          periodMonth: 9,
          perLessonCost: 34_615,
          discountPercent: 0,
        },
        {
          studentId: 2,
          groupId: 'g1',
          periodYear: 2026,
          periodMonth: 10,
          perLessonCost: 32_143,
          discountPercent: 0,
        },
      ]),
    },
    student: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 1, firstName: 'Ali', lastName: 'Valiyev' }]),
    },
  };
}

describe('AttendanceFactsLoader.load', () => {
  it('reads the window once, scoped through the group, @db.Date bounds, upper bound exclusive', async () => {
    const prisma = prismaMock();
    await new AttendanceFactsLoader(prisma as never).load(1001, [1], SEPT);
    expect(prisma.attendance.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      date: {
        gte: d('2026-09-01T00:00:00.000Z'),
        lt: d('2026-10-01T00:00:00.000Z'),
      },
      group: { branchId: { in: [1] } },
    });
  });

  it('a CEO with no branch picked reads every branch', async () => {
    const prisma = prismaMock();
    await new AttendanceFactsLoader(prisma as never).load(1001, null, SEPT);
    expect(
      prisma.attendance.findMany.mock.calls[0][0].where.group,
    ).toBeUndefined();
  });

  it('reads the groups the marks point at — deleted ones too (no deletedAt filter)', async () => {
    const prisma = prismaMock();
    const facts = await new AttendanceFactsLoader(prisma as never).load(
      1001,
      [1],
      SEPT,
    );
    expect(prisma.group.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['g1'] },
      companyId: 1001,
    });
    expect(facts.rows).toEqual([
      {
        groupId: 'g1',
        studentId: 1,
        date: '2026-09-07',
        status: 'PRESENT',
        cancelled: false,
      },
      {
        groupId: 'g1',
        studentId: 2,
        date: '2026-09-07',
        status: 'EXCUSED',
        cancelled: true,
      },
    ]);
    expect(facts.groups.get('g1')).toEqual({
      id: 'g1',
      name: 'A1-04',
      branchId: 1,
      deleted: true,
      courseId: 'c1',
      courseName: 'Standart',
      monthly: true,
      teacherId: 7,
      teacherName: 'Otabek Sobirov', // the first by name
    });
  });

  it('no mark means no group query', async () => {
    const prisma = prismaMock();
    prisma.attendance.findMany.mockResolvedValueOnce([]);
    const facts = await new AttendanceFactsLoader(prisma as never).load(
      1001,
      [1],
      SEPT,
    );
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(facts.groups.size).toBe(0);
  });
});

describe('AttendanceFactsLoader.loadCharges', () => {
  it('reads CHARGED charges of the asked students, groups and months, and keeps only the asked keys', async () => {
    const prisma = prismaMock();
    const out = await new AttendanceFactsLoader(prisma as never).loadCharges(
      1001,
      [
        { studentId: 1, groupId: 'g1', month: '2026-09' },
        { studentId: 1, groupId: 'g1', month: '2026-09' },
        { studentId: 2, groupId: 'g1', month: '2026-10' },
      ],
    );
    expect(
      prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].where,
    ).toEqual({
      companyId: 1001,
      status: 'CHARGED',
      studentId: { in: [1, 2] },
      groupId: { in: ['g1'] },
      OR: [
        { periodYear: 2026, periodMonth: 9 },
        { periodYear: 2026, periodMonth: 10 },
      ],
    });
    // Deterministic order: with a rejoin the LAST charge of a group+month must win.
    expect(
      prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].orderBy,
    ).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(out).toEqual([
      {
        studentId: 1,
        groupId: 'g1',
        month: '2026-09',
        perLessonCost: 34_615,
        discountPercent: 10,
      },
      {
        studentId: 2,
        groupId: 'g1',
        month: '2026-10',
        perLessonCost: 32_143,
        discountPercent: 0,
      },
    ]);
  });

  it('asks nothing for no key', async () => {
    const prisma = prismaMock();
    expect(
      await new AttendanceFactsLoader(prisma as never).loadCharges(1001, []),
    ).toEqual([]);
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });
});

describe('AttendanceFactsLoader.loadStudentNames', () => {
  it('names students «Ism Familiya», archived cards included', async () => {
    const prisma = prismaMock();
    const names = await new AttendanceFactsLoader(
      prisma as never,
    ).loadStudentNames(1001, [1, 1]);
    expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({
      id: { in: [1] },
      companyId: 1001,
    });
    expect(names.get(1)).toBe('Ali Valiyev');
  });
});
