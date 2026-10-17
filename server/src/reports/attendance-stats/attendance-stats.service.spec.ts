import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceStatsService } from './attendance-stats.service';
import type { AttRow, AttendanceFacts } from './attendance-stats.types';

const mark = (
  studentId: number,
  status: AttRow['status'],
  day: number,
): AttRow => ({
  groupId: 'g1',
  studentId,
  date: `2026-09-${String(day).padStart(2, '0')}`,
  status,
  cancelled: false,
});
const FACTS: AttendanceFacts = {
  groups: new Map([
    [
      'g1',
      {
        id: 'g1',
        name: 'A1-04',
        branchId: 1,
        deleted: false,
        courseId: 'c1',
        courseName: 'Standart',
        monthly: true,
        teacherId: 7,
        teacherName: 'Otabek Sobirov',
      },
    ],
  ]),
  rows: [
    mark(1, 'ABSENT', 1),
    mark(1, 'ABSENT', 2),
    mark(1, 'ABSENT', 3),
    mark(1, 'ABSENT', 4),
    mark(2, 'ABSENT', 1),
    mark(2, 'ABSENT', 2),
    mark(2, 'ABSENT', 3),
    mark(3, 'PRESENT', 1),
    mark(4, 'EXCUSED', 1),
    mark(4, 'EXCUSED', 2),
  ],
};
const CHARGES = [
  {
    studentId: 4,
    groupId: 'g1',
    month: '2026-09',
    perLessonCost: 30_000,
    discountPercent: 0,
  },
];
const Q = { startDate: '2026-09-01', endDate: '2026-09-30' };

function setup() {
  const loader = {
    load: jest.fn().mockResolvedValue(FACTS),
    loadCharges: jest.fn().mockResolvedValue(CHARGES),
    loadStudentNames: jest.fn().mockResolvedValue(
      new Map([
        [1, 'Bobur Aliyev'],
        [2, 'Anvar Karimov'],
      ]),
    ),
  };
  const settings = {
    get: jest.fn((_c: number, key: string) =>
      Promise.resolve(key === 'payment.excusedCreditEnabled' ? true : null),
    ),
  };
  const streaks = {
    computeStreaks: jest.fn().mockResolvedValue([
      { studentId: 5, enrollmentId: 'e1' },
      { studentId: 5, enrollmentId: 'e2' },
      { studentId: 6, enrollmentId: 'e3' },
    ]),
  };
  const service = new AttendanceStatsService(
    loader as never,
    settings as never,
    streaks as never,
  );
  return { loader, settings, streaks, service };
}

describe('AttendanceStatsService', () => {
  it('refuses an empty scope before reading anything', async () => {
    const { service, loader, streaks } = setup();
    await expect(service.overview(1001, [], Q)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.missers(1001, [], { ...Q, key: 'g1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(loader.load).not.toHaveBeenCalled();
    expect(streaks.computeStreaks).not.toHaveBeenCalled();
  });

  it('refuses a period before 2026-05-01 with 400', async () => {
    const { service, loader } = setup();
    await expect(
      service.overview(1001, [1], {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('reads the whole span once, the streak in the same scope, and answers', async () => {
    const { service, loader, streaks, settings } = setup();
    const o = await service.overview(1001, [1], Q);
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(loader.load).toHaveBeenCalledWith(1001, [1], {
      from: '2026-05-01',
      to: '2026-10-01',
    });
    expect(streaks.computeStreaks).toHaveBeenCalledWith({
      companyId: 1001,
      branchIds: [1],
      threshold: 3,
    });
    expect(o.streak).toBe(2); // distinct students
    expect(o.cut).toMatchObject({ key: 'group', page: 1, pageSize: 10 });
    expect(settings.get).toHaveBeenCalledWith(
      1001,
      'payment.excusedCreditEnabled',
      1,
    );
    expect(settings.get).toHaveBeenCalledWith(
      1001,
      'payment.excusedCreditMonthlyCap',
      1,
    );
    expect(o.credit).toEqual({
      lessons: 2,
      students: 1,
      amount: 60_000,
      enabled: true,
      uncharged: 0,
    });
  });

  it('a CEO with no branch picked: the streak reads every branch', async () => {
    const { service, streaks } = setup();
    await service.overview(1001, null, Q);
    expect(streaks.computeStreaks).toHaveBeenCalledWith({
      companyId: 1001,
      branchIds: undefined,
      threshold: 3,
    });
  });

  it('missers: the period only, most absences first, names, a page past the end clamped', async () => {
    const { service, loader } = setup();
    const out = await service.missers(1001, [1], {
      ...Q,
      cut: 'teacher',
      key: '7',
      page: 9,
    });
    expect(loader.load).toHaveBeenCalledWith(1001, [1], {
      from: '2026-09-01',
      to: '2026-10-01',
    });
    expect(out).toEqual({
      rows: [
        {
          studentId: 1,
          groupId: 'g1',
          absent: 4,
          lessons: 4,
          name: 'Bobur Aliyev',
          groupName: 'A1-04',
        },
        {
          studentId: 2,
          groupId: 'g1',
          absent: 3,
          lessons: 3,
          name: 'Anvar Karimov',
          groupName: 'A1-04',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    });
  });

  it('excel: same scope rule, one read, a named file', async () => {
    const { service, loader } = setup();
    await expect(service.excel(1001, [], Q)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const out = await service.excel(1001, [1], Q);
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(out.filename).toBe('davomat-2026-09-01_2026-09-30.xlsx');
    expect(out.buffer.length).toBeGreaterThan(0);
  });
});
